import { describe, expect, it } from 'vitest'
import { resolveStaticPath } from '../src/static/resolve-path'

const ROOT = '/srv/app/dist'

describe('resolveStaticPath', () => {
  it('resolves paths inside the root', () => {
    expect(resolveStaticPath(ROOT, '/index.html')).toBe(
      '/srv/app/dist/index.html',
    )
    expect(resolveStaticPath(ROOT, '/assets/app.js')).toBe(
      '/srv/app/dist/assets/app.js',
    )
  })

  it('decodes percent-encoded filenames', () => {
    expect(resolveStaticPath(ROOT, '/my%20file.html')).toBe(
      '/srv/app/dist/my file.html',
    )
  })

  it.each([
    ['/../../../../etc/passwd'],
    ['/../package.json'],
    ['/%2e%2e/%2e%2e/etc/passwd'],
    ['/..%2f..%2fetc/passwd'],
    ['/assets/../../../../etc/passwd'],
    ['/%2e%2e%2f%2e%2e%2fetc/passwd'],
  ])('refuses to escape the root via %s', (pathname) => {
    expect(resolveStaticPath(ROOT, pathname)).toBeNull()
  })

  it('refuses malformed encoding and null bytes', () => {
    expect(resolveStaticPath(ROOT, '/%ZZ')).toBeNull()
    expect(resolveStaticPath(ROOT, '/app%00.html')).toBeNull()
  })

  it('does not treat a sibling directory sharing a prefix as inside', () => {
    expect(
      resolveStaticPath('/srv/app/dist', '/../dist-secrets/key'),
    ).toBeNull()
  })
})
