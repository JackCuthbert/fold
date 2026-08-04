import { describe, expect, it } from 'vitest'
import { loadConfig, useSecureCookie } from '../src/config'

const BASE = { SESSION_SECRET: 'a-secret-at-least-16-chars' }

describe('loadConfig', () => {
  // The config is a trust boundary (CLAUDE.md): a deployment that starts
  // with a weak or missing secret is worse than one that refuses to start,
  // because the secret seals the user's CalDAV credentials.
  it('refuses to start without a usable SESSION_SECRET', () => {
    expect(() => loadConfig({})).toThrow()
    expect(() => loadConfig({ SESSION_SECRET: 'too-short' })).toThrow()
  })
})

// docs/specs/deployment.md — HTTPS. `Secure` is the difference between a
// cookie the network can read and one it cannot, so the rule deciding it
// is worth pinning.
describe('useSecureCookie', () => {
  it('secures the cookie in production', () => {
    expect(
      useSecureCookie(loadConfig({ ...BASE, NODE_ENV: 'production' })),
    ).toBe(true)
  })

  it('drops Secure in development, so local http works', () => {
    expect(
      useSecureCookie(loadConfig({ ...BASE, NODE_ENV: 'development' })),
    ).toBe(false)
  })

  // The escape hatch for a self-hosted deployment with no TLS available.
  it('drops Secure in production when explicitly allowed', () => {
    const config = loadConfig({
      ...BASE,
      NODE_ENV: 'production',
      ALLOW_INSECURE_COOKIE: 'true',
    })
    expect(useSecureCookie(config)).toBe(false)
  })

  // Downgrading security must take a deliberate act, so this fails
  // closed: a stray empty value from a compose file, an explicit "false",
  // or a typo all leave the cookie secure. A typo that silently *removed*
  // `Secure` would be the one failure nobody notices until the cookie is
  // on the wire.
  it('keeps the cookie secure unless the opt-in is affirmative', () => {
    for (const value of ['false', '0', 'no', '', 'ture', 'please']) {
      const config = loadConfig({
        ...BASE,
        NODE_ENV: 'production',
        ALLOW_INSECURE_COOKIE: value,
      })
      expect(useSecureCookie(config), `for ${JSON.stringify(value)}`).toBe(true)
    }
  })
})
