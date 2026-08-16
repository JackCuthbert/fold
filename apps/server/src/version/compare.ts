/**
 * Is `latest` a newer release than `current`? (docs/specs/releases.md)
 *
 * Hand-rolled rather than pulling in a semver library: the comparison this
 * needs is numeric on three fields, and the one interesting case is that
 * `0.10.0` is newer than `0.9.0` — which a string compare gets wrong and
 * which is exactly the case a 0.x project hits.
 *
 * **Anything unparseable answers `false`.** The result decides whether to
 * tell someone an upgrade exists; being wrong in that direction sends them
 * to a release page for nothing, so an unrecognised version is treated as
 * "nothing to say" rather than guessed at.
 *
 * Pre-release suffixes (`0.3.0-rc.1`) are deliberately ignored — the
 * release workflow publishes no pre-releases (`"prerelease": false`), so
 * handling them would be untested code guarding a case that cannot arise.
 * A tag carrying one simply parses as the release it precedes, which
 * errs toward not nagging.
 */
export function isNewer(latest: string, current: string): boolean {
  const a = parse(latest)
  const b = parse(current)
  if (a === null || b === null) return false
  if (a.major !== b.major) return a.major > b.major
  if (a.minor !== b.minor) return a.minor > b.minor
  return a.patch > b.patch
}

interface Version {
  major: number
  minor: number
  patch: number
}

/**
 * `v0.10.2` or `0.10.2` → `{major: 0, minor: 10, patch: 2}`; anything else
 * → null.
 *
 * Named fields rather than a tuple so the comparison above reads as what
 * it means, and so neither has to index into an array the type system
 * cannot prove is long enough.
 */
function parse(version: string): Version | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim())
  if (!match) return null
  const [, major, minor, patch] = match
  // The capture groups are guaranteed by the pattern, but narrowing them
  // here is cheaper than asserting it — and Number('') is 0, so an empty
  // capture would silently parse as a valid version.
  if (
    major === undefined ||
    minor === undefined ||
    patch === undefined ||
    !Number.isSafeInteger(Number(major)) ||
    !Number.isSafeInteger(Number(minor)) ||
    !Number.isSafeInteger(Number(patch))
  ) {
    return null
  }
  return { major: Number(major), minor: Number(minor), patch: Number(patch) }
}
