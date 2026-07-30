import type {
  Credentials,
  NewTodo,
  Todo,
  TodoChanges,
  TodoList,
  TodosResponse,
} from '@caldav-todo/schemas'
import { applyChanges, createTodoIcs, readTodo } from '@caldav-todo/vtodo'
import { DAVClient } from 'tsdav'
import { CaldavError, CaldavUnreachableError } from './errors'
import type { CaldavGateway } from './gateway'

const VTODO_FILTER = [
  {
    'comp-filter': {
      _attributes: { name: 'VCALENDAR' },
      'comp-filter': { _attributes: { name: 'VTODO' } },
    },
  },
]

const listIdFromHref = (href: string): string =>
  href.replace(/\/+$/, '').split('/').at(-1) ?? href

const escapeXml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

/**
 * Wrap upstream failures in our typed errors.
 *
 * Deliberately not attempting a general "extract any 3-digit number from
 * the message and treat it as an HTTP status" fallback here. Most of
 * tsdav's thrown Errors (missing account fields, "cannot find
 * principalUrl", "Invalid auth method", etc. — see tsdav's client/
 * account/collection modules) are plain programming/config errors with
 * no status code in them at all; a bare digit-group regex would risk
 * matching an unrelated number (a port, a path segment) and misreporting
 * a config problem as a specific upstream HTTP status. The one case that
 * reliably embeds a real status — 401 from principal discovery — is
 * matched explicitly below. Anything else genuinely unrecognised falls
 * through to CaldavUnreachableError (502, "keep queueing"): that undersells
 * a real 403/500 from the CalDAV server, but is safer than a confident
 * wrong guess, since 502 is at least retryable and doesn't route the user
 * to a login screen or a permanent-conflict UI incorrectly.
 */
async function translate<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof CaldavError) throw error
    if (error instanceof TypeError) {
      throw new CaldavUnreachableError(error.message)
    }
    // tsdav surfaces auth failures as thrown errors mentioning the status.
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('401') || /invalid credentials/i.test(message)) {
      throw new CaldavError(401, message)
    }
    throw new CaldavUnreachableError(message)
  }
}

function assertOk(response: { status: number; ok: boolean }): void {
  if (response.ok) return
  throw new CaldavError(response.status)
}

// tsdav's DAVCalendar/DAVObject types leave displayName/etag/data loosely
// typed (an object displayName is possible; etag/data can be undefined
// when the server omits them from a REPORT response) — narrowed here per
// what Radicale (and the integration suite) actually sends.
interface RawCalendar {
  url: string
  displayName?: string | Record<string, unknown>
  ctag?: string
  components?: string[]
}

interface RawObject {
  url: string
  etag?: string
  data?: unknown
}

const supportsVtodo = (calendar: RawCalendar): boolean =>
  !calendar.components || calendar.components.includes('VTODO')

const dataAsString = (data: unknown): string =>
  typeof data === 'string' ? data : ''

// Exported for unit testing: this is the one piece of REPORT/GET → Todo
// mapping logic that doesn't require a live server to exercise (the rest
// of the gateway is covered by the Radicale integration suite — see
// docs/specs/testing.md).
export function toTodo(listId: string, object: RawObject): Todo | null {
  const data = readTodo(dataAsString(object.data))
  if (!data) {
    // `readTodo` returns null rather than logging — the codec has no
    // logger. Satisfying the "skip malformed, log a warning" rule in
    // docs/specs/caldav-compliance.md is the gateway's job, here.
    console.warn(`skipping malformed calendar object: ${object.url}`)
    return null
  }
  if (!object.etag) {
    // Our conflict story is entirely ETag-based (docs/specs/
    // caldav-compliance.md). A server that omits ETags on calendar
    // objects can't safely be used for concurrent editing: defaulting
    // to '' here would make every update/delete's pre-check
    // (`raw.etag !== etag`) a permanent, unconditional 412 rather than
    // a real conflict signal. Fail loudly instead of degrading to a
    // silently broken app.
    throw new CaldavError(
      500,
      `CalDAV server did not return an ETag for ${object.url} — ` +
        'ETags are required for safe concurrent editing',
    )
  }
  return { ...data, listId, href: object.url, etag: object.etag }
}

export function makeTsdavGateway(credentials: Credentials): CaldavGateway {
  const client = new DAVClient({
    serverUrl: credentials.serverUrl,
    credentials: {
      username: credentials.username,
      password: credentials.password,
    },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  })
  let loggedIn = false
  const ensureLogin = async (): Promise<void> => {
    if (loggedIn) return
    await translate(() => client.login())
    loggedIn = true
  }

  const authHeader = (): Record<string, string> => ({
    authorization: `Basic ${Buffer.from(
      `${credentials.username}:${credentials.password}`,
    ).toString('base64')}`,
  })

  const findCalendar = async (listId: string): Promise<RawCalendar> => {
    const calendars = await client.fetchCalendars()
    const calendar = calendars.find(
      (entry) => listIdFromHref(entry.url) === listId,
    )
    if (!calendar) throw new CaldavError(404, `no such list: ${listId}`)
    return calendar
  }

  const toList = (calendar: RawCalendar): TodoList => ({
    id: listIdFromHref(calendar.url),
    href: calendar.url,
    displayName:
      typeof calendar.displayName === 'string' && calendar.displayName !== ''
        ? calendar.displayName
        : listIdFromHref(calendar.url),
    ctag: calendar.ctag ?? '',
  })

  const fetchRawTodos = async (
    listId: string,
  ): Promise<{ calendar: RawCalendar; objects: RawObject[] }> => {
    const calendar = await findCalendar(listId)
    const objects = await client.fetchCalendarObjects({
      calendar,
      filters: VTODO_FILTER,
    })
    return { calendar, objects }
  }

  const findRawByUid = async (
    listId: string,
    uid: string,
  ): Promise<RawObject> => {
    const { objects } = await fetchRawTodos(listId)
    const match = objects.find(
      (object) => readTodo(dataAsString(object.data))?.uid === uid,
    )
    if (!match) throw new CaldavError(404, `no such todo: ${uid}`)
    return match
  }

  return {
    login: () => ensureLogin(),

    fetchLists: () =>
      translate(async () => {
        await ensureLogin()
        const calendars = await client.fetchCalendars()
        return calendars.filter(supportsVtodo).map(toList)
      }),

    createList: (id, displayName) =>
      translate(async () => {
        await ensureLogin()
        const home = client.account?.homeUrl
        if (!home) throw new CaldavError(500, 'no calendar home')
        const url = new URL(`${id}/`, home).href
        // tsdav issues a spec-compliant extended MKCOL/MKCALENDAR.
        await client.makeCalendar({
          url,
          props: { displayname: displayName },
        })
        const calendars = await client.fetchCalendars()
        const created = calendars.find(
          (entry) => listIdFromHref(entry.url) === id,
        )
        if (!created) throw new CaldavError(500, 'list not created')
        return toList(created)
      }),

    renameList: (listId, displayName) =>
      translate(async () => {
        await ensureLogin()
        const calendar = await findCalendar(listId)
        const response = await fetch(calendar.url, {
          method: 'PROPPATCH',
          headers: {
            ...authHeader(),
            'content-type': 'application/xml; charset=utf-8',
          },
          body: `<?xml version="1.0" encoding="utf-8"?>
<D:propertyupdate xmlns:D="DAV:">
  <D:set><D:prop>
    <D:displayname>${escapeXml(displayName)}</D:displayname>
  </D:prop></D:set>
</D:propertyupdate>`,
        })
        assertOk(response)
      }),

    deleteList: (listId) =>
      translate(async () => {
        await ensureLogin()
        const calendar = await findCalendar(listId)
        const response = await fetch(calendar.url, {
          method: 'DELETE',
          headers: authHeader(),
        })
        assertOk(response)
      }),

    fetchTodos: (listId, knownCtag): Promise<TodosResponse | null> =>
      translate(async () => {
        await ensureLogin()
        const calendar = await findCalendar(listId)
        const ctag = calendar.ctag ?? ''
        // Ctag short-circuit — docs/specs/caldav-compliance.md.
        if (knownCtag !== undefined && ctag !== '' && ctag === knownCtag) {
          return null
        }
        const objects = await client.fetchCalendarObjects({
          calendar,
          filters: VTODO_FILTER,
        })
        return {
          ctag,
          todos: objects
            .map((object) => toTodo(listId, object))
            .filter((todo): todo is Todo => todo !== null),
        }
      }),

    fetchTodo: (listId, uid) =>
      translate(async () => {
        await ensureLogin()
        const raw = await findRawByUid(listId, uid)
        const todo = toTodo(listId, raw)
        if (!todo) throw new CaldavError(500, 'malformed todo on server')
        return todo
      }),

    createTodo: (listId, input: NewTodo) =>
      translate(async () => {
        await ensureLogin()
        const calendar = await findCalendar(listId)
        const response = await client.createCalendarObject({
          calendar,
          filename: `${encodeURIComponent(input.uid)}.ics`,
          iCalString: createTodoIcs(input, new Date()),
        })
        assertOk(response)
        const raw = await findRawByUid(listId, input.uid)
        const todo = toTodo(listId, raw)
        if (!todo) throw new CaldavError(500, 'created todo unreadable')
        return todo
      }),

    updateTodo: (listId, uid, etag, changes: TodoChanges) =>
      translate(async () => {
        await ensureLogin()
        const raw = await findRawByUid(listId, uid)
        // The client edited the version it saw (`etag`). If the server
        // has moved on, that's a conflict before we even PUT.
        if (raw.etag !== etag) throw new CaldavError(412)
        const response = await client.updateCalendarObject({
          calendarObject: {
            url: raw.url,
            data: applyChanges(dataAsString(raw.data), changes, new Date()),
            etag,
          },
        })
        assertOk(response)
        const updated = await findRawByUid(listId, uid)
        const todo = toTodo(listId, updated)
        if (!todo) throw new CaldavError(500, 'updated todo unreadable')
        return todo
      }),

    deleteTodo: (listId, uid, etag) =>
      translate(async () => {
        await ensureLogin()
        const raw = await findRawByUid(listId, uid)
        if (raw.etag !== etag) throw new CaldavError(412)
        const response = await client.deleteCalendarObject({
          calendarObject: { url: raw.url, etag },
        })
        assertOk(response)
      }),
  }
}
