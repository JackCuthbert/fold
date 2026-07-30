import type { Credentials } from '@caldav-todo/schemas'
import { describe, expect, it } from 'vitest'
import {
  clearSessionCookie,
  readSession,
  sessionCookie,
} from '../src/session/cookie'

const SECRET = 'a-test-secret-at-least-16-chars'
const CREDS: Credentials = {
  serverUrl: 'http://localhost:5232',
  username: 'jack',
  password: 'hunter2',
}

describe('session cookie', () => {
  it('round-trips credentials through the Cookie header', async () => {
    const setCookie = await sessionCookie(CREDS, SECRET, false)
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Strict')
    expect(setCookie).not.toContain('hunter2')

    const value = setCookie.split(';')[0] ?? ''
    const request = new Request('http://x/', {
      headers: { cookie: `other=1; ${value}` },
    })
    expect(await readSession(request, SECRET)).toEqual(CREDS)
  })

  it('adds Secure only when asked', async () => {
    expect(await sessionCookie(CREDS, SECRET, true)).toContain('Secure')
    expect(await sessionCookie(CREDS, SECRET, false)).not.toContain('Secure')
  })

  it('returns null without a cookie or with a tampered one', async () => {
    expect(await readSession(new Request('http://x/'), SECRET)).toBeNull()
    const request = new Request('http://x/', {
      headers: { cookie: 'session=tampered' },
    })
    expect(await readSession(request, SECRET)).toBeNull()
  })

  it('clearSessionCookie expires the cookie', () => {
    expect(clearSessionCookie()).toContain('Max-Age=0')
  })
})
