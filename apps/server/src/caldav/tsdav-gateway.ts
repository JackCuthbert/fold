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

// Bun's fetch drops an idle/reused connection out from under an in-flight
// request under concurrent load and throws this plain Error — verified by
// instrumenting translate() and firing concurrent bursts at a healthy
// local Radicale: every single failure was this exact message, never a
// real Radicale error. It is not confined to login(): a first pass fixing
// only login()'s fetch chain still left it escaping from a bare
// `client.fetchCalendars()` call, proving the connection reset is a
// property of any fetch tsdav makes under concurrent load, not something
// specific to the login handshake. Each API request builds a fresh
// DAVClient (login() isn't cached across requests — docs/specs/
// authentication.md requires the gateway to stay stateless per request,
// so caching the client is not an option), so ordinary concurrent usage
// opens far more simultaneous sockets against Radicale's simple HTTP
// server than "one request per user action" would suggest, and it
// occasionally drops one mid-request.
//
// Fixed once, universally, via tsdav's `fetch` override (threaded through
// every internal call — login, fetchCalendars, fetchCalendarObjects,
// createCalendarObject, etc.): retry only idempotent/safe HTTP methods
// (GET/HEAD/OPTIONS/PROPFIND/REPORT). A connection reset means the
// request was never actually answered, so for these methods nothing was
// double-applied server-side and a retry is always safe. Mutating methods
// (PUT/DELETE/PROPPATCH/MKCALENDAR/POST) are deliberately left unretried
// here: createTodo's PUT carries `If-None-Match: *`, update/delete carry
// an etag precondition, so if a reset ever did happen post-write, a blind
// retry could turn into a spurious 412 instead of the write actually
// failing — that non-idempotent risk isn't worth taking. Those still
// surface as CaldavUnreachableError (502) on a reset, which the client
// already retries safely through the outbox.
const TRANSIENT_SOCKET_ERROR = /socket connection was closed unexpectedly/i
const IDEMPOTENT_METHODS = new Set([
  'GET',
  'HEAD',
  'OPTIONS',
  'PROPFIND',
  'REPORT',
])
const FETCH_RETRY_ATTEMPTS = 3
const FETCH_RETRY_DELAY_MS = 50

const isTransientSocketError = (error: unknown): boolean =>
  error instanceof Error && TRANSIENT_SOCKET_ERROR.test(error.message)

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The retry policy itself, factored out from the global `fetch` it wraps
 * in production so it can be exercised against a fake in a unit test
 * without monkey-patching `globalThis.fetch` — see tsdav-gateway.test.ts.
 * Retries a transient connection reset on idempotent/safe methods with a
 * short bounded backoff, and leaves everything else — different errors,
 * and mutating methods regardless of error — to fail through as-is. A
 * server that is genuinely unreachable fails every attempt the same way
 * and still ends up surfacing as CaldavUnreachableError once attempts are
 * exhausted; this only masks the spurious, connection-level case.
 */
export function makeFetchWithRetry(
  baseFetch: (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => Promise<Response>,
): (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => Promise<Response> {
  return function fetchWithRetry(input, init) {
    const method = (init?.method ?? 'GET').toUpperCase()
    if (!IDEMPOTENT_METHODS.has(method)) return baseFetch(input, init)

    const attempt = async (n: number): Promise<Response> => {
      try {
        return await baseFetch(input, init)
      } catch (error) {
        if (!isTransientSocketError(error) || n >= FETCH_RETRY_ATTEMPTS) {
          throw error
        }
        await delay(FETCH_RETRY_DELAY_MS * n)
        return attempt(n + 1)
      }
    }
    return attempt(1)
  }
}

// `Object.assign` (rather than a cast) attaches `preconnect` from the
// global `fetch` so this satisfies Bun's `typeof fetch` (a function plus
// that one static) structurally, without claiming to implement it —
// DAVClient never calls `preconnect` itself.
const fetchWithRetry: typeof fetch = Object.assign(makeFetchWithRetry(fetch), {
  preconnect: fetch.preconnect,
})

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
    fetch: fetchWithRetry,
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
