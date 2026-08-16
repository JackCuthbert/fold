import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createRouter } from './api/router'
import type { Route } from './api/route'
import { routes } from './api/routes'
import { makeAttemptLimiter } from './auth/attempt-limit'
import { parseAllowedHosts } from './caldav/allowed-hosts'
import type { GatewayFactory } from './caldav/gateway'
import { makeTsdavGateway } from './caldav/tsdav-gateway'
import { loadConfig } from './config'
import { makeUpdateChecker } from './version/check'
import { outcomeFor, writeAccessLog } from './observability/access-log'
import { withSecurityHeaders } from './http/security-headers'
import { resolveStaticPath } from './static/resolve-path'

const config = loadConfig(process.env)

/**
 * The gateway, and any routes that come with it.
 *
 * `CALDAV_FAKE` swaps the CalDAV conversation for an in-memory fake and
 * adds the route that seeds it — for the e2e suite's mocked mode
 * (docs/specs/testing.md, docs/architecture/e2e-fake-caldav-gateway.md).
 *
 * A **dynamic** import, and the only one in this file, so the fake and its
 * admin route are not part of the module graph a production build loads:
 * the flag is refused outright under `NODE_ENV=production` (config.ts), so
 * this branch cannot be taken there, and the `await import` means the code
 * is never even read. A static import would ship both modules into the
 * image regardless.
 *
 * *(added 2026-08-14, issue #54.)*
 */
async function resolveGateway(): Promise<{
  makeGateway: GatewayFactory
  extraRoutes: Route[]
}> {
  if (!config.CALDAV_FAKE) {
    return { makeGateway: makeTsdavGateway, extraRoutes: [] }
  }
  console.warn(
    'CALDAV_FAKE is on — serving an in-memory fake CalDAV gateway and ' +
      'the test-only seeding route. Never use this outside the e2e suite.',
  )
  const [{ makeFakeGateway }, { fakeAdmin }] = await Promise.all([
    import('./caldav/fake-gateway'),
    import('./api/testing/fake-admin'),
  ])
  return { makeGateway: makeFakeGateway, extraRoutes: [fakeAdmin] }
}

const { makeGateway, extraRoutes } = await resolveGateway()

const handleApi = createRouter([...routes, ...extraRoutes], {
  config,
  makeGateway,
  // One checker for the process, so its cache is shared across requests
  // rather than rebuilt per call (docs/specs/releases.md).
  checkForUpdate: makeUpdateChecker({ enabled: config.CHECK_FOR_UPDATES }),
  // One limiter for the process, for the same reason: its counters are the
  // whole point, and a per-request instance would count to one forever
  // (docs/specs/security.md).
  signInAttempts: makeAttemptLimiter(),
  // Parsed once at startup: the value cannot change while the process
  // runs, and empty means unrestricted (docs/specs/security.md).
  allowedCaldavHosts: parseAllowedHosts(config.CALDAV_ALLOWED_HOSTS),
})

const clientDist = resolve(import.meta.dirname, '../../client/dist')

async function serveStatic(pathname: string): Promise<Response> {
  const candidate = resolveStaticPath(
    clientDist,
    pathname === '/' ? '/index.html' : pathname,
  )
  if (candidate !== null && existsSync(candidate)) {
    return new Response(Bun.file(candidate))
  }
  // SPA fallback: unknown paths get index.html
  const index = join(clientDist, 'index.html')
  if (existsSync(index)) return new Response(Bun.file(index))
  return new Response('client not built', { status: 404 })
}

/**
 * Static requests get an access log too, but never their path.
 *
 * Asset paths are not personal data the way an API path is, but logging
 * them would still record which deep link a user opened — so this reports
 * the class of request (`static`) and nothing more, which is enough to see
 * that asset serving is healthy (docs/specs/observability.md).
 */
async function serveStaticLogged(pathname: string): Promise<Response> {
  const startedAt = performance.now()
  const response = await serveStatic(pathname)
  writeAccessLog({
    method: 'GET',
    route: 'static',
    status: response.status,
    outcome: outcomeFor(response.status),
    durationMs: Math.round(performance.now() - startedAt),
  })
  return response
}

Bun.serve({
  port: config.PORT,
  // Bun's default is 10 seconds, which a genuinely slow CalDAV server
  // exceeds routinely — every request died as a socket hang up.
  //
  // 255 is Bun's hard maximum (`Bun.serve expects idleTimeout to be 255 or
  // less`, verified against Bun 1.3.14), so the 5 minutes the issue asked
  // for is not available here. This is the ceiling, and it is deliberately
  // *above* the router's own `HANDLER_TIMEOUT_MS`: the router answers first
  // with a 502 the client understands, and this only catches what escapes
  // it (docs/specs/api.md — error mapping).
  idleTimeout: 255,
  // Security headers are applied *here*, at the one seam every response
  // passes through, rather than inside the router and the static handler
  // separately (docs/specs/security.md). Two call sites is two chances for
  // a later branch to return early and miss them.
  fetch: async (request) => {
    const { pathname } = new URL(request.url)
    const response = pathname.startsWith('/api/')
      ? await handleApi(request)
      : await serveStaticLogged(pathname)
    return withSecurityHeaders(response)
  },
})

console.log(`caldav-todo server listening on :${config.PORT}`)
