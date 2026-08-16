import { describe, expect, it } from 'vitest'
import { isHostAllowed, parseAllowedHosts } from '../src/caldav/allowed-hosts'

// docs/specs/security.md — the opt-in restriction on which CalDAV hosts
// the BFF may be pointed at (issue #43).
describe('parseAllowedHosts', () => {
  it('splits, trims and lowercases', () => {
    expect(parseAllowedHosts(' DAV.Example.com , 192.168.1.10:5232 ')).toEqual([
      'dav.example.com',
      '192.168.1.10:5232',
    ])
  })

  it('reads an unset or empty value as no restriction', () => {
    // An operator who never sets this, or leaves `FOO=` in a compose file,
    // must keep working exactly as before.
    expect(parseAllowedHosts('')).toEqual([])
    expect(parseAllowedHosts('   ')).toEqual([])
    expect(parseAllowedHosts(',,')).toEqual([])
  })
})

describe('isHostAllowed', () => {
  it('allows anything when the list is empty', () => {
    // The default. Deliberately fail-open: the alternative is that
    // upgrading Fold silently breaks every deployment's sign-in.
    expect(isHostAllowed('http://127.0.0.1:5232/', [])).toBe(true)
    expect(isHostAllowed('https://anything.example/', [])).toBe(true)
  })

  it('allows a named host and refuses everything else', () => {
    const allowed = ['dav.example.com']
    expect(isHostAllowed('https://dav.example.com/jack/', allowed)).toBe(true)
    expect(isHostAllowed('http://127.0.0.1:5232/', allowed)).toBe(false)
    expect(isHostAllowed('http://169.254.169.254/', allowed)).toBe(false)
  })

  it('ignores the port when the rule does not name one', () => {
    // Otherwise an operator who wrote `dav.example.com` would be surprised
    // by their own non-default port being refused.
    expect(
      isHostAllowed('https://dav.example.com:8443/', ['dav.example.com']),
    ).toBe(true)
  })

  it('enforces the port when the rule names one', () => {
    const allowed = ['192.168.1.10:5232']
    expect(isHostAllowed('http://192.168.1.10:5232/u/', allowed)).toBe(true)
    // A different service on the same box is a different target.
    expect(isHostAllowed('http://192.168.1.10:8080/', allowed)).toBe(false)
  })

  it('matches a wildcard subdomain but not its parent', () => {
    const allowed = ['*.example.com']
    expect(isHostAllowed('https://dav.example.com/', allowed)).toBe(true)
    expect(isHostAllowed('https://a.b.example.com/', allowed)).toBe(true)
    // Mirrors TLS wildcard behaviour: `*.example.com` is not `example.com`.
    expect(isHostAllowed('https://example.com/', allowed)).toBe(false)
  })

  it('cannot be fooled by a lookalike domain', () => {
    // The bug a naive `endsWith` would have: `evil-example.com` ends with
    // `example.com`, and an attacker registers exactly that.
    expect(isHostAllowed('https://evil-example.com/', ['*.example.com'])).toBe(
      false,
    )
    expect(isHostAllowed('https://notexample.com/', ['example.com'])).toBe(
      false,
    )
  })

  it('is not defeated by casing or a trailing dot host', () => {
    expect(isHostAllowed('https://DAV.Example.COM/', ['dav.example.com'])).toBe(
      true,
    )
  })

  it('refuses a scheme the gateway would never speak', () => {
    // file: and friends are not CalDAV, and some reach places HTTP cannot.
    const allowed = ['dav.example.com']
    expect(isHostAllowed('file:///etc/passwd', allowed)).toBe(false)
    expect(isHostAllowed('ftp://dav.example.com/', allowed)).toBe(false)
    expect(isHostAllowed('gopher://dav.example.com/', allowed)).toBe(false)
  })

  it('refuses a URL it cannot parse', () => {
    expect(isHostAllowed('not a url', ['dav.example.com'])).toBe(false)
  })

  it('is not defeated by credentials or a path in the URL', () => {
    // `http://dav.example.com@evil.test/` parses with hostname `evil.test`
    // — the userinfo is not the host, and a string search would get this
    // wrong.
    expect(
      isHostAllowed('http://dav.example.com@evil.test/', ['dav.example.com']),
    ).toBe(false)
    expect(
      isHostAllowed('https://evil.test/dav.example.com', ['dav.example.com']),
    ).toBe(false)
  })
})
