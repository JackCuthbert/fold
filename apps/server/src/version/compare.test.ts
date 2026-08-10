import { describe, expect, it } from 'vitest'
import { isNewer } from './compare'

describe('isNewer', () => {
  // The case that rules out a string compare, and the one a 0.x project
  // actually reaches: "0.10.0" < "0.9.0" alphabetically, and the tenth
  // minor is exactly where this project is headed.
  it('compares numerically, not alphabetically', () => {
    expect(isNewer('0.10.0', '0.9.0')).toBe(true)
    expect(isNewer('0.9.0', '0.10.0')).toBe(false)
    expect(isNewer('1.0.0', '0.99.99')).toBe(true)
  })

  it('is false for the same version', () => {
    expect(isNewer('0.2.0', '0.2.0')).toBe(false)
  })

  it('is false when the running version is ahead', () => {
    // Someone running a build from main, ahead of the last release.
    expect(isNewer('0.2.0', '0.3.0')).toBe(false)
  })

  it('compares patch and minor independently', () => {
    expect(isNewer('0.2.1', '0.2.0')).toBe(true)
    expect(isNewer('0.3.0', '0.2.9')).toBe(true)
    expect(isNewer('0.2.0', '0.2.1')).toBe(false)
  })

  // Release tags carry a `v`; package.json does not.
  it('accepts a leading v on either side', () => {
    expect(isNewer('v0.3.0', '0.2.0')).toBe(true)
    expect(isNewer('0.3.0', 'v0.2.0')).toBe(true)
  })

  // Being wrong here sends someone to a release page for nothing, so
  // anything unrecognised means "nothing to say" rather than a guess.
  it('says no rather than guessing at an unparseable version', () => {
    for (const value of ['', 'latest', 'main', '1.2', 'v', 'x.y.z', '..']) {
      expect(isNewer(value, '0.2.0'), `latest=${JSON.stringify(value)}`).toBe(
        false,
      )
      expect(isNewer('0.3.0', value), `current=${JSON.stringify(value)}`).toBe(
        false,
      )
    }
  })

  // The workflow publishes no pre-releases, so a suffix is treated as the
  // release it precedes — which errs toward not nagging.
  it('ignores a pre-release suffix', () => {
    expect(isNewer('0.3.0-rc.1', '0.3.0')).toBe(false)
    expect(isNewer('0.3.0-rc.1', '0.2.0')).toBe(true)
  })
})
