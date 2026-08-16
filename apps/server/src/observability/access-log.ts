/**
 * Access logging — docs/specs/observability.md.
 *
 * **Zero personal information, by construction rather than by discipline.**
 * `AccessLogEntry` is a closed set of non-identifying fields, so the only
 * way to log something sensitive is to add a field for it. Redacting at the
 * point of writing would mean every future call site is one forgotten
 * `delete` away from leaking a password.
 *
 * What is deliberately absent, and why each one would be personal data:
 *
 * - **The raw path.** `/api/lists/:listId` is logged as the *pattern*, never
 *   as the concrete URL. A list id is a CalDAV collection identifier and a
 *   stable per-user handle; a log of them is a log of who has what.
 * - **Query strings and request bodies.** Todo titles and notes are the
 *   user's own words, and the sign-in body carries their CalDAV password.
 * - **Cookies and `authorization`.** The session cookie *is* the sealed
 *   credential — logging it is logging the password (crypto/seal.ts).
 * - **The CalDAV server URL.** Frequently a personal hostname, and it
 *   identifies the user's provider.
 * - **Client IP and `user-agent`.** Both identify the person, and the IP is
 *   personal data under the GDPR on its own.
 *
 * That leaves the two questions an access log actually has to answer: did
 * this request succeed, and how long did it take.
 *
 * *(added 2026-08-10.)*
 */

/** Where a request ended up. Coarser than a status code, and the thing
 *  worth alerting on: `fail` is ours, `upstream` is the CalDAV server's. */
export type Outcome = 'ok' | 'client' | 'fail' | 'upstream'

export interface AccessLogEntry {
  /** HTTP method — a fixed vocabulary, so it carries nothing personal. */
  method: string
  /**
   * The matched *route pattern* (`/api/todos/:listId`), not the request
   * path. `null` when nothing matched, which is the honest answer: logging
   * the raw path of a 404 would put arbitrary attacker- or user-supplied
   * strings into the log.
   */
  route: string | null
  status: number
  outcome: Outcome
  /** Whole milliseconds. Sub-millisecond precision is noise here, and a
   *  high-resolution timing is a weak fingerprint. */
  durationMs: number
}

/** Map a status to an outcome. 5xx splits: 502 is the upstream CalDAV
 *  server failing (docs/specs/api.md — error mapping), which is not the
 *  same operational event as a bug in this server. */
export function outcomeFor(status: number): Outcome {
  if (status >= 500) return status === 502 ? 'upstream' : 'fail'
  if (status >= 400) return 'client'
  return 'ok'
}

/**
 * One line of JSON per request.
 *
 * JSON because the container's logs are collected from stdout (`docker
 * logs`, and whatever ships them onward), so a structured line stays
 * queryable where a human-formatted one has to be regex'd back apart.
 */
export function formatAccessLog(entry: AccessLogEntry): string {
  return JSON.stringify({
    msg: 'request',
    method: entry.method,
    route: entry.route,
    status: entry.status,
    outcome: entry.outcome,
    durationMs: entry.durationMs,
  })
}

export type LogSink = (line: string) => void

/**
 * Emit an access log line.
 *
 * The sink is injectable so tests can assert on what is written without
 * capturing global stdout — and so a runtime that needs a different
 * transport can supply one without touching the router.
 */
export function writeAccessLog(
  entry: AccessLogEntry,
  sink: LogSink = console.log,
): void {
  sink(formatAccessLog(entry))
}
