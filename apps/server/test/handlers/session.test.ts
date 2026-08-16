import { describe, expect, it, vi } from 'vitest'
import { MAX_ATTEMPTS } from '../../src/auth/attempt-limit'
import { CaldavError, CaldavUnreachableError } from '../../src/caldav/errors'
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

// docs/specs/security.md — sign-in is the one route that acts on an
// unauthenticated caller's instructions, so failures against a target are
// capped (issue #43).
describe('POST /api/session — the attempt cap', () => {
  it('refuses further attempts once the cap is reached', async () => {
    const login = vi.fn(() => Promise.reject(new CaldavError(401)))
    const handle = createRouter(routes, testApp({ login }))

    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      expect((await handle(loginRequest(CREDS))).status).toBe(401)
    }

    const blocked = await handle(loginRequest(CREDS))
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('retry-after')).toMatch(/^\d+$/)
    // The upstream is no longer being asked — which is the point: the BFF
    // has stopped relaying guesses.
    expect(login).toHaveBeenCalledTimes(MAX_ATTEMPTS)
  })

  it('does not count an unreachable server toward the cap', async () => {
    // A CalDAV server that is merely down says nothing about whether the
    // password was right. Counting those would let an outage lock out the
    // very user trying to sign in once it recovers.
    const login = vi.fn(() =>
      Promise.reject(new CaldavUnreachableError('down')),
    )
    const handle = createRouter(routes, testApp({ login }))

    for (let i = 0; i < MAX_ATTEMPTS + 3; i += 1) {
      expect((await handle(loginRequest(CREDS))).status).toBe(502)
    }
    expect(login).toHaveBeenCalledTimes(MAX_ATTEMPTS + 3)
  })

  it('lets a different account through while one is locked', async () => {
    const handle = createRouter(
      routes,
      testApp({ login: () => Promise.reject(new CaldavError(401)) }),
    )
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) await handle(loginRequest(CREDS))
    expect((await handle(loginRequest(CREDS))).status).toBe(429)

    // Same server, different principal — an unrelated user must not be
    // collateral damage.
    const other = await handle(
      loginRequest({ ...CREDS, username: 'someone-else' }),
    )
    expect(other.status).toBe(401)
  })

  it('clears the count after a successful sign-in', async () => {
    let succeed = false
    const handle = createRouter(
      routes,
      testApp({
        login: () =>
          succeed ? Promise.resolve() : Promise.reject(new CaldavError(401)),
      }),
    )

    // Fumble, then get it right.
    for (let i = 0; i < MAX_ATTEMPTS - 1; i += 1)
      await handle(loginRequest(CREDS))
    succeed = true
    expect((await handle(loginRequest(CREDS))).status).toBe(200)

    // The earlier failures are forgiven, so a fresh run of failures gets
    // the full allowance rather than locking out immediately.
    succeed = false
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      expect((await handle(loginRequest(CREDS))).status).toBe(401)
    }
    expect((await handle(loginRequest(CREDS))).status).toBe(429)
  })

  it('never echoes the credentials it refused', async () => {
    const handle = createRouter(
      routes,
      testApp({ login: () => Promise.reject(new CaldavError(401)) }),
    )
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) await handle(loginRequest(CREDS))
    const body = await (await handle(loginRequest(CREDS))).text()
    expect(body).not.toContain(CREDS.password)
    expect(body).not.toContain(CREDS.username)
    expect(body).not.toContain(CREDS.serverUrl)
  })
})

// docs/specs/security.md — the opt-in CalDAV host allowlist (issue #43).
describe('POST /api/session — the CalDAV host allowlist', () => {
  it('signs in normally when no allowlist is set', async () => {
    // The default. Upgrading Fold must not break an existing deployment.
    const login = vi.fn().mockResolvedValue(undefined)
    const handle = createRouter(routes, testApp({ login }))
    expect((await handle(loginRequest(CREDS))).status).toBe(200)
  })

  it('refuses a host that is not on the list, without calling out', async () => {
    const login = vi.fn().mockResolvedValue(undefined)
    const handle = createRouter(
      routes,
      testApp({ login }, { allowedCaldavHosts: ['dav.example.com'] }),
    )
    const res = await handle(loginRequest(CREDS))
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'server_not_allowed' })
    // The point of the whole feature: no request left the process.
    expect(login).not.toHaveBeenCalled()
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('lets an allowed host through', async () => {
    const login = vi.fn().mockResolvedValue(undefined)
    const handle = createRouter(
      routes,
      testApp({ login }, { allowedCaldavHosts: ['dav.example.com'] }),
    )
    const res = await handle(
      loginRequest({ ...CREDS, serverUrl: 'https://dav.example.com/jack/' }),
    )
    expect(res.status).toBe(200)
    expect(login).toHaveBeenCalled()
  })

  it('does not spend an attempt on a refused host', async () => {
    // A refused host never reaches the network, so it is not a failed
    // sign-in — otherwise a misconfigured client hammering a disallowed
    // URL would lock out the legitimate one.
    const login = vi.fn(() => Promise.reject(new CaldavError(401)))
    const handle = createRouter(
      routes,
      testApp({ login }, { allowedCaldavHosts: ['dav.example.com'] }),
    )
    for (let i = 0; i < MAX_ATTEMPTS + 5; i += 1) {
      expect((await handle(loginRequest(CREDS))).status).toBe(403)
    }
    // The allowed host still has its full allowance.
    const allowed = { ...CREDS, serverUrl: 'https://dav.example.com/jack/' }
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      expect((await handle(loginRequest(allowed))).status).toBe(401)
    }
    expect((await handle(loginRequest(allowed))).status).toBe(429)
  })

  it('does not leak the allowlist in the refusal', async () => {
    // Telling an attacker which hosts *are* reachable would undo some of
    // the benefit of refusing.
    const handle = createRouter(
      routes,
      testApp(undefined, {
        allowedCaldavHosts: ['secret-internal.example.com'],
      }),
    )
    const body = await (await handle(loginRequest(CREDS))).text()
    expect(body).not.toContain('secret-internal')
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
