import {
  type Credentials,
  formatListColor,
  type NewTodo,
  parseListColor,
  type Todo,
  type TodoChanges,
  type TodoList,
  type TodosResponse,
} from '@fold/schemas'
import { applyChanges, createTodoIcs, readTodo } from '@fold/vtodo'
import { DAVClient } from 'tsdav'
import { CaldavError, CaldavUnreachableError } from './errors'
import { limitConcurrency } from './limit-concurrency'
import type { CaldavGateway } from './gateway'

const VTODO_FILTER = [
  {
    'comp-filter': {
      _attributes: { name: 'VCALENDAR' },
      'comp-filter': { _attributes: { name: 'VTODO' } },
    },
  },
]

// docs/specs/lists.md — ordering. tsdav's default PROPFIND already asks
// for `ca:calendar-color` but not `ca:calendar-order`, and passing `props`
// *replaces* the defaults rather than extending them — so every property
// the gateway relies on has to be listed here, not just the new one.
const LIST_PROPS = {
  'c:calendar-description': {},
  'c:calendar-timezone': {},
  'd:displayname': {},
  'ca:calendar-color': {},
  'ca:calendar-order': {},
  'cs:getctag': {},
  'd:resourcetype': {},
  'c:supported-calendar-component-set': {},
  'd:sync-token': {},
}

// tsdav only surfaces a non-default property under `projectedProps` when
// it is named here.
const LIST_PROJECTED = { calendarColor: true, calendarOrder: true }

const listIdFromHref = (href: string): string =>
  href.replace(/\/+$/, '').split('/').at(-1) ?? href

const escapeXml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

/**
 * `calendar-order` → an integer, or `null` when missing or unreadable.
 *
 * Radicale returns a JS number; XML has no number type, so another server
 * may well return a string. Both are accepted, and anything else is
 * treated as absent rather than raised — the same "degrade, don't fail"
 * rule the colour parser follows (docs/specs/caldav-compliance.md).
 */
const parseListOrder = (raw: unknown): number | null => {
  if (typeof raw === 'number') return Number.isInteger(raw) ? raw : null
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!/^-?\d+$/.test(trimmed)) return null
  const value = Number(trimmed)
  return Number.isSafeInteger(value) ? value : null
}

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

// Every CalDAV request the gateway makes funnels through here, which is
// why the concurrency cap belongs at this seam: tsdav fans out one
// PROPFIND *per collection* during discovery, and Bun's fetch stalls for
// ~1s above roughly seven concurrent requests to a host (issue #24 — see
// limit-concurrency.ts for the measurements). Capping here fixes every
// call site at once, including the ones inside tsdav that we don't own.
//
// The limit wraps the *retrying* fetch rather than the reverse, so a
// retry re-queues behind other work instead of holding its slot while it
// waits out the backoff.
//
// `Object.assign` (rather than a cast) attaches `preconnect` from the
// global `fetch` so this satisfies Bun's `typeof fetch` (a function plus
// that one static) structurally, without claiming to implement it —
// DAVClient never calls `preconnect` itself.
const fetchWithRetry: typeof fetch = Object.assign(
  limitConcurrency(makeFetchWithRetry(fetch)),
  { preconnect: fetch.preconnect },
)

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
  // docs/specs/lists.md — colours: tsdav requests `ca:calendar-color` by
  // default and surfaces it here (verified against Radicale 3.5.4.0).
  calendarColor?: string
  // `calendar-order` is *not* a tsdav default — it arrives here only
  // because fetchCalendars is called with explicit props plus
  // `projectedProps` below.
  projectedProps?: Record<string, unknown>
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

// Exported for unit testing, same as `toTodo` above: this is PROPFIND →
// TodoList mapping that needs no live server (docs/specs/testing.md).
export function toList(calendar: RawCalendar): TodoList {
  const color = parseListColor(calendar.calendarColor)
  const order = parseListOrder(calendar.projectedProps?.['calendarOrder'])
  return {
    id: listIdFromHref(calendar.url),
    href: calendar.url,
    displayName:
      typeof calendar.displayName === 'string' && calendar.displayName !== ''
        ? calendar.displayName
        : listIdFromHref(calendar.url),
    ctag: calendar.ctag ?? '',
    // Omitted entirely when absent, never set to undefined —
    // exactOptionalPropertyTypes keeps "no colour" distinct from
    // "colour explicitly unset".
    ...(color !== null ? { color } : {}),
    ...(order !== null ? { order } : {}),
  }
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

  const fetchCalendarsWithProps = (): Promise<RawCalendar[]> =>
    client.fetchCalendars({
      props: LIST_PROPS,
      projectedProps: LIST_PROJECTED,
    })

  /**
   * The collection URL for a list id, without asking the server.
   *
   * A list id *is* the last path segment of its collection URL —
   * `toList` derives one from the other (`listIdFromHref`), and
   * `createList` builds the URL this same way. So resolving a URL never
   * needed a round trip, let alone the full discovery fan-out
   * `findCalendar` used to do: one PROPFIND of the calendar home plus one
   * *per collection*, on every read and every write (issue #24).
   *
   * With 20 lists that was 23 requests to learn one href — and because
   * Bun's fetch stalls above ~7 concurrent requests to a host, it cost
   * ~1.3s rather than the ~2ms the work actually takes.
   *
   * A bad id yields a URL the server 404s, which `assertOk`/`translate`
   * already turn into the same `CaldavError(404)` the old lookup threw
   * explicitly — so the failure mode is unchanged, it just costs one
   * request instead of N.
   *
   * *(added 2026-08-04, issue #24.)*
   */
  const calendarUrl = (listId: string): string => {
    const home = client.account?.homeUrl
    if (!home) throw new CaldavError(500, 'no calendar home')
    return new URL(`${encodeURIComponent(listId)}/`, home).href
  }

  /**
   * A minimal `RawCalendar` for the operations that only need a URL.
   *
   * tsdav's `createCalendarObject`/`fetchCalendarObjects` read `url` and
   * nothing else off the calendar, so synthesising it avoids discovery
   * entirely. Anything that needs *live* collection state — the ctag for
   * the 304 short-circuit — must still ask the server; see `fetchCtag`.
   */
  const calendarRef = (listId: string): RawCalendar => ({
    url: calendarUrl(listId),
  })

  /**
   * The collection's current ctag — one PROPFIND of that collection, not
   * of every collection. This is the one piece of live state the todo
   * read path genuinely needs (docs/specs/caldav-compliance.md — the
   * ctag short-circuit).
   */
  const fetchCtag = async (listId: string): Promise<string> => {
    const response = await fetch(calendarUrl(listId), {
      method: 'PROPFIND',
      headers: {
        ...authHeader(),
        Depth: '0',
        'Content-Type': 'application/xml',
      },
      body:
        '<?xml version="1.0"?><propfind xmlns="DAV:" ' +
        'xmlns:CS="http://calendarserver.org/ns/">' +
        '<prop><CS:getctag/></prop></propfind>',
    })
    assertOk(response)
    const text = await response.text()
    return /<(?:\w+:)?getctag>([^<]*)<\/(?:\w+:)?getctag>/.exec(text)?.[1] ?? ''
  }

  const fetchRawTodos = async (
    listId: string,
  ): Promise<{ calendar: RawCalendar; objects: RawObject[] }> => {
    const calendar = calendarRef(listId)
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
        const calendars = await fetchCalendarsWithProps()
        return calendars.filter(supportsVtodo).map(toList)
      }),

    createList: (id, displayName, props) =>
      translate(async () => {
        await ensureLogin()
        const home = client.account?.homeUrl
        if (!home) throw new CaldavError(500, 'no calendar home')
        const url = new URL(`${id}/`, home).href
        // tsdav issues a spec-compliant extended MKCOL/MKCALENDAR, and
        // already declares the http://apple.com/ns/ical/ namespace — so a
        // new list can be born with its colour and order rather than
        // needing a follow-up PROPPATCH (docs/specs/lists.md — a new list
        // must not jump, which needs its order set at creation).
        //
        // `!= null` covers both null and undefined deliberately: MKCALENDAR
        // creates a fresh collection, so there is nothing for `null` to
        // clear and omitting the property is the correct handling of both.
        await client.makeCalendar({
          url,
          props: {
            displayname: displayName,
            ...(props?.color != null
              ? { 'ca:calendar-color': formatListColor(props.color) }
              : {}),
            ...(props?.order != null
              ? { 'ca:calendar-order': String(props.order) }
              : {}),
          },
        })
        const calendars = await fetchCalendarsWithProps()
        const created = calendars.find(
          (entry) => listIdFromHref(entry.url) === id,
        )
        if (!created) throw new CaldavError(500, 'list not created')
        return toList(created)
      }),

    renameList: (listId, displayName) =>
      translate(async () => {
        await ensureLogin()
        const calendar = calendarRef(listId)
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

    setListProps: (listId, props) =>
      translate(async () => {
        await ensureLogin()
        const calendar = calendarRef(listId)
        // docs/specs/lists.md — colours and ordering. `null` clears a
        // property (D:remove), a value sets it (D:set), and `undefined`
        // omits it from the request entirely so it is left alone.
        const sets: string[] = []
        const removes: string[] = []
        if (props.color === null) {
          removes.push('<CA:calendar-color/>')
        } else if (props.color !== undefined) {
          sets.push(
            `<CA:calendar-color>${escapeXml(
              formatListColor(props.color),
            )}</CA:calendar-color>`,
          )
        }
        if (props.order === null) {
          removes.push('<CA:calendar-order/>')
        } else if (props.order !== undefined) {
          sets.push(
            `<CA:calendar-order>${String(props.order)}</CA:calendar-order>`,
          )
        }
        if (sets.length === 0 && removes.length === 0) return
        const body = `<?xml version="1.0" encoding="utf-8"?>
<D:propertyupdate xmlns:D="DAV:" xmlns:CA="http://apple.com/ns/ical/">
${sets.length > 0 ? `  <D:set><D:prop>${sets.join('')}</D:prop></D:set>` : ''}
${removes.length > 0 ? `  <D:remove><D:prop>${removes.join('')}</D:prop></D:remove>` : ''}
</D:propertyupdate>`
        const response = await fetch(calendar.url, {
          method: 'PROPPATCH',
          headers: {
            ...authHeader(),
            'content-type': 'application/xml; charset=utf-8',
          },
          body,
        })
        // A PROPPATCH returns 207 Multi-Status, which `ok` accepts. A
        // per-property failure inside the body is deliberately NOT treated
        // as an error: these are optional extension properties, and a
        // server that refuses them must not break list editing
        // (docs/specs/caldav-compliance.md).
        assertOk(response)
      }),

    deleteList: (listId) =>
      translate(async () => {
        await ensureLogin()
        const calendar = calendarRef(listId)
        const response = await fetch(calendar.url, {
          method: 'DELETE',
          headers: authHeader(),
        })
        assertOk(response)
      }),

    fetchTodos: (listId, knownCtag): Promise<TodosResponse | null> =>
      translate(async () => {
        await ensureLogin()
        // The one read that needs live collection state, so it asks for
        // exactly that — one PROPFIND of this collection, not discovery
        // of every collection (issue #24).
        const ctag = await fetchCtag(listId)
        // Ctag short-circuit — docs/specs/caldav-compliance.md.
        if (knownCtag !== undefined && ctag !== '' && ctag === knownCtag) {
          return null
        }
        const objects = await client.fetchCalendarObjects({
          calendar: calendarRef(listId),
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
        const calendar = calendarRef(listId)
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
