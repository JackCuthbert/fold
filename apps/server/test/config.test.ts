import { describe, expect, it } from 'vitest'
import { E2E_CONFIRMATION, loadConfig, useSecureCookie } from '../src/config'

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

// docs/specs/testing.md — the two e2e modes. *(added 2026-08-14, issue
// #54.)*
//
// `CALDAV_FAKE` replaces the CalDAV server with an in-memory fake and
// exposes an unauthenticated seeding route. The guard refusing it is the
// only thing standing between that and a real deployment, so it is pinned
// here the same way `ALLOW_INSECURE_COOKIE`'s fail-closed rule is below —
// otherwise a refactor that quietly drops it passes every check in CI.
describe('CALDAV_FAKE', () => {
  it('refuses to start in production, confirmation or not', () => {
    expect(() =>
      loadConfig({ ...BASE, NODE_ENV: 'production', CALDAV_FAKE: '1' }),
    ).toThrow(/NODE_ENV=production/)
    expect(() =>
      loadConfig({
        ...BASE,
        NODE_ENV: 'production',
        CALDAV_FAKE: '1',
        CALDAV_FAKE_CONFIRM: E2E_CONFIRMATION,
      }),
    ).toThrow(/NODE_ENV=production/)
  })

  // `NODE_ENV` defaults to development, and docs/specs/deployment.md
  // describes self-hosters who never set it — so a production-only check
  // would leave exactly those deployments unguarded. The second opt-in is
  // what makes the flag fail closed *everywhere*.
  it('refuses to start without the explicit confirmation', () => {
    for (const confirm of [undefined, '', 'yes', 'true', 'i-am-running']) {
      expect(
        () =>
          loadConfig({
            ...BASE,
            CALDAV_FAKE: '1',
            ...(confirm === undefined ? {} : { CALDAV_FAKE_CONFIRM: confirm }),
          }),
        `for ${JSON.stringify(confirm)}`,
      ).toThrow(/CALDAV_FAKE_CONFIRM/)
    }
  })

  // Every affirmative form `z.stringbool()` accepts must hit the guard,
  // not just the "1" the e2e config happens to use.
  it('refuses every affirmative spelling of the flag', () => {
    for (const value of ['1', 'true', 'yes', 'on']) {
      expect(
        () => loadConfig({ ...BASE, CALDAV_FAKE: value }),
        `for ${JSON.stringify(value)}`,
      ).toThrow()
    }
  })

  it('starts when the suite asks for it properly', () => {
    const config = loadConfig({
      ...BASE,
      CALDAV_FAKE: '1',
      CALDAV_FAKE_CONFIRM: E2E_CONFIRMATION,
    })
    expect(config.CALDAV_FAKE).toBe(true)
  })

  // Absent, empty and unparseable all mean "not asked for" — the ordinary
  // case, which must start normally with the real gateway.
  it('is off, and silent, when not asked for', () => {
    for (const value of [undefined, '', 'nonsense']) {
      const config = loadConfig({
        ...BASE,
        ...(value === undefined ? {} : { CALDAV_FAKE: value }),
      })
      expect(config.CALDAV_FAKE, `for ${JSON.stringify(value)}`).toBe(false)
    }
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
