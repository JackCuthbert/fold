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
})
