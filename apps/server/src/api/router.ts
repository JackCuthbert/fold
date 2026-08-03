import { ZodError } from 'zod'
import { CaldavError, CaldavUnreachableError } from '../caldav/errors'
import { HttpError } from '../http/errors'
import { json, matchPath, type AppContext, type Route } from './route'

// Error mapping per docs/specs/api.md.
function toResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return json({ error: error.code, message: error.message }, error.status)
  }
  if (error instanceof ZodError) {
    return json({ error: 'invalid_request', message: error.message }, 400)
  }
  if (error instanceof CaldavError) {
    if (error.status === 401) {
      return json({ error: 'unauthorized', message: error.message }, 401)
    }
    if (error.status === 412) {
      return json({ error: 'conflict', message: error.message }, 412)
    }
    // A 4xx from CalDAV is about the request, not the server's health —
    // preserve it. Flattening a 404 (deleted list) to 502 told the client
    // "unreachable, keep retrying" and looped forever
    // (docs/specs/api.md — error mapping).
    if (error.status === 404) {
      return json({ error: 'not_found', message: error.message }, 404)
    }
    if (error.status >= 400 && error.status < 500) {
      return json(
        { error: 'caldav_error', message: error.message },
        error.status,
      )
    }
    return json({ error: 'caldav_error', message: error.message }, 502)
  }
  if (error instanceof CaldavUnreachableError) {
    return json(
      { error: 'caldav_unreachable', message: 'CalDAV server unreachable' },
      502,
    )
  }
  console.error('unhandled error', error)
  return json({ error: 'internal', message: 'Internal server error' }, 500)
}

/**
 * How long a handler may run before we answer on its behalf.
 *
 * This must stay *below* `Bun.serve`'s `idleTimeout` (see index.ts). Bun's
 * timeout severs the socket before any of the mapping above can run, so the
 * client gets a hang-up — indistinguishable from "the BFF is broken" — for
 * what is really just a slow upstream. Answering first keeps the failure on
 * the documented 502 path (docs/specs/api.md — error mapping), which the
 * client already understands as "server unreachable, keep the queue".
 *
 * *(added 2026-08-04: a real CalDAV server slower than Bun's 10s default
 * failed every request as a socket hang up / 500.)*
 */
export const HANDLER_TIMEOUT_MS = 240_000

export function createRouter(
  routes: Route[],
  app: AppContext,
  options: { timeoutMs?: number } = {},
) {
  const timeoutMs = options.timeoutMs ?? HANDLER_TIMEOUT_MS
  return async (request: Request): Promise<Response> => {
    const { pathname } = new URL(request.url)
    for (const route of routes) {
      if (route.method !== request.method) continue
      const params = matchPath(route.path, pathname)
      if (!params) continue
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        // A CalDAV request can hang rather than reject, so `catch` alone
        // never fires — the deadline has to be an explicit race.
        return await Promise.race([
          route.handle({ request, params, app }),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  new CaldavUnreachableError(
                    `CalDAV server did not respond within ${timeoutMs}ms`,
                  ),
                ),
              timeoutMs,
            )
          }),
        ])
      } catch (error) {
        return toResponse(error)
      } finally {
        // The loser of the race is abandoned, not cancelled; clearing the
        // timer keeps a won race from holding the process awake.
        clearTimeout(timer)
      }
    }
    return json({ error: 'not_found', message: 'No such route' }, 404)
  }
}
