import { describe, expect, it } from 'vitest'
import { ApiError, NetworkError } from '../../api'
import { describeLoginError } from './login-screen'

/** The message a given HTTP status produces. */
const forStatus = (status: number): string =>
  describeLoginError(new ApiError(status, {})) ?? ''

// Three of these statuses are the BFF's own answer rather than the CalDAV
// server's, and each would otherwise read as "could not reach the server"
// — wrong, and it sends the user to check a URL that is fine.
// docs/specs/security.md.
describe('describeLoginError', () => {
  it('says nothing when there is no error', () => {
    expect(describeLoginError(null)).toBeNull()
    expect(describeLoginError(undefined)).toBeNull()
  })

  it('distinguishes the four cases a user can actually hit', () => {
    // Each must be distinct — collapsing any two is the bug this guards.
    const forbidden = forStatus(403)
    const throttled = forStatus(429)
    const rejected = forStatus(401)
    const unreachable = describeLoginError(new NetworkError('offline')) ?? ''

    expect(new Set([forbidden, throttled, rejected, unreachable]).size).toBe(4)
  })

  it('points a refused host at the operator, not at the credentials', () => {
    // The user cannot fix this by retyping their password.
    const message = describeLoginError(new ApiError(403, {})) ?? ''
    expect(message).toMatch(/allows certain CalDAV servers/i)
    expect(message).not.toMatch(/credentials/i)
  })

  it('tells a throttled user to wait rather than to check the URL', () => {
    const message = describeLoginError(new ApiError(429, {})) ?? ''
    expect(message).toMatch(/wait/i)
    expect(message).not.toMatch(/check the url/i)
  })

  it('falls back to unreachable for anything unrecognised', () => {
    // A 500, a proxy error, a dropped connection — all genuinely "could
    // not reach", and the fallback must not throw on a non-ApiError.
    expect(describeLoginError(new ApiError(502, {}))).toMatch(
      /could not reach/i,
    )
    expect(describeLoginError(new Error('boom'))).toMatch(/could not reach/i)
    expect(describeLoginError('a string')).toMatch(/could not reach/i)
  })
})
