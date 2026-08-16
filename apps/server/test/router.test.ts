import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { CaldavError, CaldavUnreachableError } from '../src/caldav/errors'
import { createRouter } from '../src/api/router'
import { json, type Route } from '../src/api/route'
import { HttpError } from '../src/http/errors'
import { testApp } from './helpers/test-app'

const routes: Route[] = [
  {
    method: 'GET',
    path: '/api/echo/:name',
    handle: (ctx) => Promise.resolve(json({ name: ctx.params['name'] })),
  },
  {
    method: 'POST',
    path: '/api/parse',
    handle: async (ctx) => {
      z.object({ n: z.number() }).parse(await ctx.request.json())
      return json({ ok: true })
    },
  },
  {
    method: 'GET',
    path: '/api/http-error',
    handle: () => Promise.reject(new HttpError(403, 'nope', 'Nope')),
  },
  {
    method: 'GET',
    path: '/api/caldav-401',
    handle: () => Promise.reject(new CaldavError(401)),
  },
  {
    method: 'GET',
    path: '/api/unreachable',
    handle: () => Promise.reject(new CaldavUnreachableError('down')),
  },
  {
    method: 'GET',
    path: '/api/caldav-404',
    handle: () => Promise.reject(new CaldavError(404, 'no such list: abc')),
  },
  {
    method: 'GET',
    path: '/api/caldav-403',
    handle: () => Promise.reject(new CaldavError(403, 'forbidden')),
  },
  {
    method: 'GET',
    path: '/api/caldav-500',
    handle: () => Promise.reject(new CaldavError(500, 'upstream broke')),
  },
  {
    method: 'GET',
    path: '/api/hangs',
    handle: () => new Promise<Response>(() => {}),
  },
  {
    method: 'GET',
    path: '/api/slow',
    handle: () =>
      new Promise<Response>((resolve) =>
        setTimeout(() => resolve(json({ ok: true })), 20),
      ),
  },
]

const handle = createRouter(routes, testApp())

describe('router', () => {
  it('routes and decodes path params', async () => {
    const res = await handle(new Request('http://x/api/echo/list%2Fone'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ name: 'list/one' })
  })

  it('404s unknown paths and 405s wrong methods as 404', async () => {
    expect((await handle(new Request('http://x/api/nope'))).status).toBe(404)
    const res = await handle(
      new Request('http://x/api/echo/a', { method: 'POST' }),
    )
    expect(res.status).toBe(404)
  })

  it('maps zod failures to 400 with a structured body', async () => {
    const res = await handle(
      new Request('http://x/api/parse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ n: 'not a number' }),
      }),
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'invalid_request' })
  })

  it('passes HttpError through', async () => {
    const res = await handle(new Request('http://x/api/http-error'))
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'nope' })
  })

  it('maps CaldavError(401) to 401', async () => {
    const res = await handle(new Request('http://x/api/caldav-401'))
    expect(res.status).toBe(401)
  })

  it('maps CaldavUnreachableError to 502', async () => {
    const res = await handle(new Request('http://x/api/unreachable'))
    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ error: 'caldav_unreachable' })
  })

  // A deleted list must not read as "server unreachable": the client
  // retries 5xx forever, so flattening 404 to 502 looped endlessly against
  // a list that no longer exists (docs/specs/api.md — error mapping).
  it('preserves a CalDAV 404 instead of reporting 502', async () => {
    const res = await handle(new Request('http://x/api/caldav-404'))
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: 'not_found' })
  })

  it('preserves other CalDAV 4xx statuses', async () => {
    const res = await handle(new Request('http://x/api/caldav-403'))
    expect(res.status).toBe(403)
  })

  it('still maps a CalDAV 5xx to 502', async () => {
    const res = await handle(new Request('http://x/api/caldav-500'))
    expect(res.status).toBe(502)
  })

  // A handler that outlives the deadline must fail the same way an
  // unreachable server does, rather than being killed by Bun's own idle
  // timeout — which severs the socket before any mapping runs and leaves
  // the client with a hang-up it cannot classify (docs/specs/api.md).
  it('answers 502 when a handler exceeds the deadline', async () => {
    const withDeadline = createRouter(routes, testApp(), { timeoutMs: 10 })
    const res = await withDeadline(new Request('http://x/api/hangs'))
    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ error: 'caldav_unreachable' })
  })

  it('leaves a handler that finishes inside the deadline alone', async () => {
    const withDeadline = createRouter(routes, testApp(), { timeoutMs: 200 })
    const res = await withDeadline(new Request('http://x/api/slow'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})
