import type { Credentials } from '@fold/schemas'
import type { ZodType } from 'zod'
import type { AttemptLimiter } from '../auth/attempt-limit'
import type { GatewayFactory } from '../caldav/gateway'
import type { Config } from '../config'
import type { UpdateChecker } from '../version/check'
import { HttpError } from '../http/errors'
import { readSessionRecord, shouldRenew } from '../session/cookie'

export interface AppContext {
  config: Config
  makeGateway: GatewayFactory
  /**
   * Asks whether a newer release exists, or resolves null when the check
   * is off — the default (docs/specs/releases.md). Injected rather than
   * imported so the version route can be tested without a network, and so
   * one cache is shared across requests.
   */
  checkForUpdate: UpdateChecker
  /**
   * Bounds failed sign-in attempts (docs/specs/security.md). Lives here
   * rather than in the handler's module scope so its state is shared
   * across requests but rebuilt per app — otherwise one test's lockout
   * would leak into the next.
   */
  signInAttempts: AttemptLimiter
  /**
   * Hosts sign-in may point at, already parsed — empty means unrestricted
   * (docs/specs/security.md). Parsed once here rather than per request:
   * the value never changes after startup, and re-splitting a string on
   * every sign-in is work for nothing.
   */
  allowedCaldavHosts: string[]
}

export interface RequestContext {
  request: Request
  params: Record<string, string>
  app: AppContext
  /**
   * Set by `requireCredentials` when a request arrived with a valid
   * session, so the router can slide the cookie's expiry forward
   * (docs/specs/authentication.md — session lifetime).
   *
   * A mutable field on the context rather than a return value, because
   * renewal has to happen for *every* authenticated route and threading it
   * through nine handlers' return types would mean nine chances to forget.
   */
  renewSession?: Credentials
}

export interface Route {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  handle: (ctx: RequestContext) => Promise<Response>
}

/** Match `/api/lists/:listId` style paths. Returns params or null. */
export function matchPath(
  pattern: string,
  pathname: string,
): Record<string, string> | null {
  const patternParts = pattern.split('/')
  const pathParts = pathname.split('/')
  if (patternParts.length !== pathParts.length) return null
  const params: Record<string, string> = {}
  for (const [index, part] of patternParts.entries()) {
    const actual = pathParts[index] ?? ''
    if (part.startsWith(':')) {
      if (actual === '') return null
      params[part.slice(1)] = decodeURIComponent(actual)
    } else if (part !== actual) {
      return null
    }
  }
  return params
}

export async function requireCredentials(
  ctx: RequestContext,
): Promise<Credentials> {
  const record = await readSessionRecord(
    ctx.request,
    ctx.app.config.SESSION_SECRET,
  )
  if (!record) throw new HttpError(401, 'unauthorized', 'Not signed in')
  // Mark the session for renewal, so the 7-day expiry measures *inactivity*
  // rather than time since sign-in — otherwise a session in daily use would
  // still end abruptly a week after it started.
  //
  // Only once the cookie is old enough to be worth re-issuing: renewing on
  // every request lets a request that was already in flight when the
  // session ended hand a working cookie back, undoing a sign-out. See
  // `RENEW_AFTER_SECONDS`.
  if (shouldRenew(record.issuedAt)) ctx.renewSession = record.credentials
  return record.credentials
}

export const json = (
  body: unknown,
  status = 200,
  headers?: Record<string, string>,
) => Response.json(body, { status, ...(headers ? { headers } : {}) })

/**
 * Validate data the gateway returned before it goes out over the wire —
 * zod at every trust boundary applies to API output as much as input
 * (CLAUDE.md). A failure here means our own gateway produced a value its
 * own schema forbids: that is a server bug, not a bad client request, so
 * it is surfaced as 500 rather than reusing the 400 `invalid_request`
 * path reserved for request-body validation.
 */
export function parseResponse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new HttpError(
      500,
      'internal',
      `response failed schema validation: ${result.error.message}`,
    )
  }
  return result.data
}
