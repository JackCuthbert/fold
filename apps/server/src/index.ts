import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createRouter } from './api/router'
import { routes } from './api/routes'
import { makeTsdavGateway } from './caldav/tsdav-gateway'
import { loadConfig } from './config'
import { makeUpdateChecker } from './version/check'
import { outcomeFor, writeAccessLog } from './observability/access-log'
import { resolveStaticPath } from './static/resolve-path'

const config = loadConfig(process.env)
const handleApi = createRouter(routes, {
  config,
  makeGateway: makeTsdavGateway,
  // One checker for the process, so its cache is shared across requests
  // rather than rebuilt per call (docs/specs/releases.md).
  checkForUpdate: makeUpdateChecker({ enabled: config.CHECK_FOR_UPDATES }),
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
  fetch: (request) => {
    const { pathname } = new URL(request.url)
    if (pathname.startsWith('/api/')) return handleApi(request)
    return serveStaticLogged(pathname)
  },
})

console.log(`caldav-todo server listening on :${config.PORT}`)
