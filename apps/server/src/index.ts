import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createRouter } from './api/router'
import { routes } from './api/routes'
import { makeTsdavGateway } from './caldav/tsdav-gateway'
import { loadConfig } from './config'

const config = loadConfig(process.env)
const handleApi = createRouter(routes, {
  config,
  makeGateway: makeTsdavGateway,
})

const clientDist = join(import.meta.dirname, '../../client/dist')

async function serveStatic(pathname: string): Promise<Response> {
  const candidate = join(clientDist, pathname === '/' ? 'index.html' : pathname)
  if (existsSync(candidate)) {
    return new Response(Bun.file(candidate))
  }
  // SPA fallback: unknown paths get index.html
  const index = join(clientDist, 'index.html')
  if (existsSync(index)) return new Response(Bun.file(index))
  return new Response('client not built', { status: 404 })
}

Bun.serve({
  port: config.PORT,
  fetch: (request) => {
    const { pathname } = new URL(request.url)
    if (pathname.startsWith('/api/')) return handleApi(request)
    return serveStatic(pathname)
  },
})

console.log(`caldav-todo server listening on :${config.PORT}`)
