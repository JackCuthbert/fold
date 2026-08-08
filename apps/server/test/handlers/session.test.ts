import { describe, expect, it, vi } from 'vitest'
import { CaldavError } from '../../src/caldav/errors'
import { createRouter } from '../../src/api/router'
import { routes } from '../../src/api/routes'
import { testApp, TEST_SECRET } from '../helpers/test-app'
import {
  clearSessionCookie,
  readSession,
  RENEW_AFTER_SECONDS,
  sessionCookie,
} from '../../src/session/cookie'
import { requireCredentials, type Route } from '../../src/api/route'

const CREDS = {
  serverUrl: 'http://localhost:5232',
  username: 'jack',
  password: 'hunter2',
}

const loginRequest = (body: unknown) =>
  new Request('http://x/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/session', () => {
  it('verifies credentials, sets the sealed cookie, returns the session', async () => {
    const login = vi.fn().mockResolvedValue(undefined)
    const handle = createRouter(routes, testApp({ login }))
    const res = await handle(loginRequest(CREDS))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      serverUrl: CREDS.serverUrl,
      username: CREDS.username,
    })
    expect(login).toHaveBeenCalled()

    const setCookie = res.headers.get('set-cookie') ?? ''
    const cookieRequest = new Request('http://x/', {
      headers: { cookie: setCookie.split(';')[0] ?? '' },
    })
    expect(await readSession(cookieRequest, TEST_SECRET)).toEqual(CREDS)
  })

  it('401s when the CalDAV server rejects the credentials', async () => {
    const handle = createRouter(
      routes,
      testApp({ login: () => Promise.reject(new CaldavError(401)) }),
    )
    const res = await handle(loginRequest(CREDS))
    expect(res.status).toBe(401)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('400s an invalid body', async () => {
    const handle = createRouter(routes, testApp())
    const res = await handle(loginRequest({ serverUrl: 'not a url' }))
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/session', () => {
  it('clears the cookie', async () => {
    const handle = createRouter(routes, testApp())
    const res = await handle(
      new Request('http://x/api/session', { method: 'DELETE' }),
    )
    expect(res.status).toBe(204)
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0')
  })
})

describe('GET /api/session', () => {
  it('returns the session for a valid cookie', async () => {
    const handle = createRouter(routes, testApp())
    const cookie = (await sessionCookie(CREDS, TEST_SECRET, false)).split(
      ';',
    )[0]
    const res = await handle(
      new Request('http://x/api/session', {
        headers: { cookie: cookie ?? '' },
      }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      serverUrl: CREDS.serverUrl,
      username: CREDS.username,
    })
  })

  it('401s without a cookie', async () => {
    const handle = createRouter(routes, testApp())
    const res = await handle(new Request('http://x/api/session'))
    expect(res.status).toBe(401)
  })
})

// docs/specs/authentication.md — session lifetime. The 7-day expiry has to
// measure inactivity, not time since sign-in, or a session in daily use
// would still end abruptly a week in.
describe('sliding session renewal', () => {
  const cookieHeader = async () =>
    (await sessionCookie(CREDS, TEST_SECRET, false)).split(';')[0] ?? ''

  const authed = async (path: string) =>
    new Request(`http://x${path}`, {
      headers: { cookie: await cookieHeader() },
    })

  // Old enough to be worth re-issuing — see RENEW_AFTER_SECONDS.
  const agedCookie = async () => {
    const issuedAt = Date.now() - (RENEW_AFTER_SECONDS + 60) * 1000
    const cookie = await sessionCookie(CREDS, TEST_SECRET, false, issuedAt)
    return cookie.split(';')[0] ?? ''
  }

  it('re-issues the cookie once it is old enough', async () => {
    const handle = createRouter(routes, testApp())
    const res = await handle(
      new Request('http://x/api/session', {
        headers: { cookie: await agedCookie() },
      }),
    )

    expect(res.status).toBe(200)
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('Max-Age=604800')
    // Still the same session, not a different one.
    const renewed = new Request('http://x/', {
      headers: { cookie: setCookie.split(';')[0] ?? '' },
    })
    expect(await readSession(renewed, TEST_SECRET)).toEqual(CREDS)
  })

  // The bug this guards, and the reason renewal is not unconditional: a
  // request already in flight when the session ended still carries the old
  // cookie. Re-issuing on *every* authenticated request handed it straight
  // back, so signing out while a poll was in the air signed you back in.
  it('does not re-issue a cookie that was just minted', async () => {
    const handle = createRouter(routes, testApp())
    const res = await handle(await authed('/api/session'))

    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('does not renew when there was no valid session', async () => {
    const handle = createRouter(routes, testApp())
    const res = await handle(new Request('http://x/api/session'))
    expect(res.status).toBe(401)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  // Renewal must never overwrite a cookie the handler set itself, or
  // signing out would hand back a working session. `destroySession` does
  // not read the session, so a route that *does* both is built here — the
  // real DELETE would pass this whether the guard worked or not.
  it("does not overwrite a handler's own set-cookie", async () => {
    const clearing: Route = {
      method: 'GET',
      path: '/api/probe',
      handle: async (ctx) => {
        await requireCredentials(ctx)
        return new Response(null, {
          status: 204,
          headers: { 'set-cookie': clearSessionCookie() },
        })
      },
    }
    const handle = createRouter([clearing], testApp())
    const res = await handle(await authed('/api/probe'))

    expect(res.status).toBe(204)
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0')
  })
})
