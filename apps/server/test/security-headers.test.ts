import { describe, expect, it } from 'vitest'
import {
  SECURITY_HEADERS,
  withSecurityHeaders,
} from '../src/http/security-headers'

const csp = (response: Response): string =>
  response.headers.get('content-security-policy') ?? ''

// docs/specs/security.md. These assert the *effect* a header has — what an
// attacker can no longer do — rather than restating the constant, which
// would pass just as happily if the policy were gutted.
describe('withSecurityHeaders', () => {
  it('denies anything the policy does not name', () => {
    // `default-src 'none'` is what makes an unlisted directive fail closed.
    // Without it, a fetch type nobody considered inherits `*`.
    expect(csp(withSecurityHeaders(new Response('x')))).toContain(
      "default-src 'none'",
    )
  })

  it('forbids inline and eval-based script execution', () => {
    // The directive that turns an injected <script> into a no-op. If either
    // of these ever appears, an XSS becomes executable again.
    const value = csp(withSecurityHeaders(new Response('x')))
    expect(value).toContain("script-src 'self'")
    expect(value).not.toContain("script-src 'self' 'unsafe-inline'")
    expect(value).not.toContain("'unsafe-eval'")
  })

  it('stops an injected form or <base> redirecting the page elsewhere', () => {
    const value = csp(withSecurityHeaders(new Response('x')))
    expect(value).toContain("form-action 'none'")
    expect(value).toContain("base-uri 'none'")
  })

  it('refuses to be framed', () => {
    const response = withSecurityHeaders(new Response('x'))
    expect(csp(response)).toContain("frame-ancestors 'none'")
    // The pre-`frame-ancestors` fallback, for browsers that ignore CSP.
    expect(response.headers.get('x-frame-options')).toBe('DENY')
  })

  it('never sends HSTS, which would lock out a plain-HTTP deployment', () => {
    // ALLOW_INSECURE_COOKIE exists precisely because some self-hosted
    // deployments have no certificate. HSTS would pin those browsers to
    // HTTPS with no way to undo it from the app (config.ts).
    const response = withSecurityHeaders(new Response('x'))
    expect(response.headers.has('strict-transport-security')).toBe(false)
  })

  it('leaks no referrer to a third party', () => {
    // A self-hosted hostname identifies its owner.
    expect(
      withSecurityHeaders(new Response('x')).headers.get('referrer-policy'),
    ).toBe('no-referrer')
  })

  it('stops content-type sniffing', () => {
    expect(
      withSecurityHeaders(new Response('x')).headers.get(
        'x-content-type-options',
      ),
    ).toBe('nosniff')
  })

  it('preserves the body, status and existing headers', () => {
    const original = Response.json({ error: 'unauthorized' }, { status: 401 })
    original.headers.set('set-cookie', 'session=; Max-Age=0')
    const response = withSecurityHeaders(original)
    expect(response.status).toBe(401)
    // A session cookie surviving this matters: sign-out sets one, and
    // dropping it would leave the user signed in.
    expect(response.headers.get('set-cookie')).toBe('session=; Max-Age=0')
  })

  it('does not overwrite a header a handler set deliberately', () => {
    const original = new Response('x', {
      headers: { 'referrer-policy': 'same-origin' },
    })
    expect(withSecurityHeaders(original).headers.get('referrer-policy')).toBe(
      'same-origin',
    )
  })

  it('applies to a response whose headers are immutable', () => {
    // A redirect's headers are guarded; mutating in place would throw here,
    // which is why this copies rather than sets.
    const redirect = Response.redirect('https://example.test/', 302)
    expect(() => withSecurityHeaders(redirect)).not.toThrow()
    expect(csp(withSecurityHeaders(redirect))).toContain("default-src 'none'")
  })

  it('sends every declared header', () => {
    // Guards the wiring, not the values: a header added to the constant but
    // never emitted would otherwise pass every test above.
    const response = withSecurityHeaders(new Response('x'))
    for (const name of Object.keys(SECURITY_HEADERS)) {
      expect(response.headers.get(name)).toBe(SECURITY_HEADERS[name])
    }
  })
})
