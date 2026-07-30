import { describe, expect, it, vi } from 'vitest'
import { CaldavError } from '../../src/caldav/errors'
import { createRouter } from '../../src/api/router'
import { routes } from '../../src/api/routes'
import { testApp, TEST_SECRET } from '../helpers/test-app'
import { readSession, sessionCookie } from '../../src/session/cookie'

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
