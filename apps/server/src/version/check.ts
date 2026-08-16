import { isNewer } from './compare'

/**
 * The newest published release, or `null` (docs/specs/releases.md).
 *
 * **The only host Fold contacts that is not the user's own CalDAV
 * server**, which is why it is opt-in and why every failure is silent: the
 * app is entirely usable without knowing whether an upgrade exists, so a
 * failed check degrades to "nothing to say" rather than surfacing an error
 * about a feature nobody asked to hear from.
 *
 * *(added 2026-08-10.)*
 */
const RELEASES_URL =
  'https://api.github.com/repos/JackCuthbert/fold/releases/latest'

/** Long enough that a busy deployment makes one call a day, short enough
 *  that a release is noticed the day after it lands. The check is not
 *  urgent — nothing depends on it. */
const CACHE_MS = 24 * 60 * 60 * 1000

/** Short: this runs inside a request, and a slow GitHub must not hold one
 *  open. Failing fast is free here, because failing means "say nothing". */
const TIMEOUT_MS = 5_000

interface Cached {
  latest: string | null
  at: number
}

export interface UpdateChecker {
  (current: string): Promise<string | null>
}

/**
 * Just the shape this module calls, not all of `typeof fetch`.
 *
 * Bun's `fetch` carries a `preconnect` static that nothing here uses, and
 * demanding it would force every test double to fake a method that is
 * never called — the same reason the CalDAV gateway takes a narrowed fetch
 * (caldav/tsdav-gateway.ts).
 */
type FetchLike = (
  input: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<Response>

/**
 * Build a checker that caches its answer.
 *
 * Returns a closure rather than using module state so tests can make their
 * own with a stub `fetch` and a controllable clock, and so two instances
 * never share a cache.
 */
export function makeUpdateChecker(options: {
  enabled: boolean
  fetchImpl?: FetchLike
  now?: () => number
  cacheMs?: number
}): UpdateChecker {
  const fetchImpl = options.fetchImpl ?? fetch
  const now = options.now ?? Date.now
  const cacheMs = options.cacheMs ?? CACHE_MS
  let cached: Cached | null = null

  return async (current: string): Promise<string | null> => {
    // The default. No cache entry is written either, so enabling it later
    // does not serve a stale "nothing".
    if (!options.enabled) return null

    // The cache holds the *fetch*, not the answer. Comparing on every call
    // instead of caching the verdict keeps the two independent: the same
    // cached tag is correctly an update for one version and not for
    // another, and returning `cached.latest` directly reported a cached
    // tag as an upgrade even when the running version was already ahead
    // of it — caught by the test below.
    const fresh = cached !== null && now() - cached.at < cacheMs
    if (!fresh) cached = { latest: await fetchLatest(fetchImpl), at: now() }

    const latest = cached?.latest ?? null
    // Only report something strictly newer, so a deployment running ahead
    // of the last release (a build from main) is never told to downgrade.
    return latest !== null && isNewer(latest, current) ? latest : null
  }
}

async function fetchLatest(fetchImpl: FetchLike): Promise<string | null> {
  try {
    const response = await fetchImpl(RELEASES_URL, {
      headers: {
        accept: 'application/vnd.github+json',
        // GitHub rejects an unidentified client on some paths, and being
        // honest about who is calling is the polite default.
        'user-agent': 'fold-selfhosted-update-check',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) return null
    const body: unknown = await response.json()
    // Validated rather than trusted: this is a trust boundary like any
    // other (CLAUDE.md), and the field is used to render UI.
    if (
      typeof body === 'object' &&
      body !== null &&
      'tag_name' in body &&
      typeof body.tag_name === 'string'
    ) {
      return body.tag_name
    }
    return null
  } catch {
    // Offline, DNS failure, timeout, rate limit, malformed JSON — all the
    // same event as far as the user is concerned: nothing to say.
    return null
  }
}
