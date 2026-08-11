/**
 * A cap on failed sign-in attempts — docs/specs/security.md.
 *
 * Sign-in is the one route that makes the BFF act on an *unauthenticated*
 * caller's instructions: it takes a `serverUrl` and credentials from
 * whoever asks and goes and tries them. That makes Fold usable as an
 * anonymous credential-testing relay positioned inside the network the
 * container runs on — the attacker's own address never reaches the CalDAV
 * server, so its rate limiting and its logs see only Fold
 * (issue #43, the pre-public audit).
 *
 * **A cap, not a delay.** The reflex is to slow failed logins down, and
 * here that would be actively harmful. Measured against Radicale with
 * bcrypt hashing, a *wrong* password already takes ~2150ms while a right
 * one takes ~146ms — non-overlapping ranges, so the response time already
 * classifies a guess on its own. Adding latency to failures widens the gap
 * an attacker is reading. It also does not bound anything: 20 guesses fired
 * in parallel still complete in the time of one.
 *
 * Capping attempts bounds the total regardless of how they are issued, and
 * costs a legitimate user nothing — they are not making dozens of failed
 * attempts a minute.
 *
 * *(added 2026-08-11.)*
 */

/**
 * Failures allowed against one target before it is refused.
 *
 * Above any plausible number of genuine typos in a burst, far below what
 * guessing needs. A human who has fumbled their password five times is
 * reading it off a password manager on the sixth, not still typing.
 */
export const MAX_ATTEMPTS = 5

/**
 * How long a target stays refused after the cap is hit.
 *
 * A fixed window rather than an escalating one: the attacker's throughput
 * is already bounded to `MAX_ATTEMPTS` per window, and escalation mostly
 * punishes the legitimate user who came back too soon.
 */
export const LOCKOUT_MS = 15 * 60 * 1000

/** Counters older than this are dropped, so the map cannot grow forever. */
const EXPIRY_MS = LOCKOUT_MS

/**
 * The most distinct targets tracked at once.
 *
 * Bounded because the key is attacker-chosen: without a ceiling, a spray
 * across many `serverUrl`s would grow the map until the process died —
 * turning a brute-force defence into a memory-exhaustion vector. When full,
 * the oldest entries are dropped first, which is also the least useful
 * information to keep.
 */
const MAX_ENTRIES = 10_000

interface Attempts {
  failures: number
  /** When the most recent failure landed. Drives both expiry and lockout. */
  lastFailureAt: number
}

export interface AttemptLimiter {
  /**
   * Take a slot before attempting a sign-in, or refuse.
   *
   * **Counts up front rather than on failure**, which is what makes the cap
   * hold against concurrency. Checking `isLocked` and then recording the
   * failure afterwards leaves a window: an attacker firing 40 requests at
   * once has every one of them read the counter before any has written to
   * it, so all 40 pass a cap of 5. Measured — 40 parallel guesses all
   * reached the upstream before this was reserved up front.
   *
   * The cost is that an in-flight attempt holds a slot until it resolves,
   * so a *correct* password consumes one too — which `release` gives back.
   */
  reserve: (key: string) => { ok: boolean; retryAfterSeconds: number }
  /**
   * Hand a slot back for an attempt that says nothing about the password —
   * an unreachable or broken server. Failing to call this would let an
   * upstream outage lock out the user waiting for it to recover.
   */
  release: (key: string) => void
  /** Clear the counter — a correct sign-in forgives earlier fumbles. */
  recordSuccess: (key: string) => void
  /** Is this target currently refused? Exposed for tests and assertions. */
  isLocked: (key: string) => boolean
}

/**
 * An opaque key for "this server, this account".
 *
 * Hashed, and never the raw URL or username, because this map is process
 * state that can end up in a heap dump or a debugger — the same reasoning
 * that keeps the access log free of both (observability/access-log.ts).
 * FNV-1a mirrors the client's `serverIdentity`; it is a bucketing key, not
 * a security boundary, so a fast non-cryptographic hash is the right tool.
 *
 * A collision would mean two targets sharing one counter, whose worst case
 * is a stranger's failures counting against an unrelated target. With a
 * 32-bit hash over a handful of live entries that is vanishingly unlikely,
 * and the consequence is a 15-minute wait rather than any disclosure.
 */
export function attemptKey(serverUrl: string, username: string): string {
  let normalized: string
  try {
    const url = new URL(serverUrl)
    normalized = `${url.protocol}//${url.host.toLowerCase()}${url.pathname.replace(/\/+$/, '')}`
  } catch {
    normalized = serverUrl.trim().replace(/\/+$/, '')
  }
  // A space cannot occur in a normalized URL, so no two distinct pairs can
  // join to the same string.
  const input = `${normalized} ${username}`
  let value = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index)
    value = Math.imul(value, 0x01000193) >>> 0
  }
  return value.toString(16).padStart(8, '0')
}

/**
 * Build a limiter.
 *
 * In-memory, which is the right scope: Fold is one container running one
 * process (docs/specs/deployment.md), and a restart clearing the counters
 * is acceptable — an attacker cannot force a restart, and a legitimate
 * user who is locked out benefits.
 *
 * `now` is injectable so the tests can advance a clock rather than sleep
 * through a 15-minute window.
 */
export function makeAttemptLimiter(
  options: {
    now?: () => number
    maxAttempts?: number
    lockoutMs?: number
  } = {},
): AttemptLimiter {
  const now = options.now ?? Date.now
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS
  const lockoutMs = options.lockoutMs ?? LOCKOUT_MS
  const entries = new Map<string, Attempts>()

  /** Drop anything past its expiry, and trim to the size ceiling. */
  const prune = (): void => {
    const cutoff = now() - EXPIRY_MS
    for (const [key, entry] of entries) {
      if (entry.lastFailureAt <= cutoff) entries.delete(key)
    }
    // Map iterates in insertion order, and every write re-inserts, so the
    // front of the iterator is the least recently touched.
    if (entries.size >= MAX_ENTRIES) {
      const excess = entries.size - MAX_ENTRIES + 1
      let dropped = 0
      for (const key of entries.keys()) {
        if (dropped >= excess) break
        entries.delete(key)
        dropped += 1
      }
    }
  }

  /** The live entry for a key, or null once it has aged out. */
  const current = (key: string): Attempts | null => {
    const entry = entries.get(key)
    if (!entry) return null
    if (entry.lastFailureAt <= now() - EXPIRY_MS) {
      entries.delete(key)
      return null
    }
    return entry
  }

  const remainingMs = (key: string): number => {
    const entry = current(key)
    if (!entry || entry.failures < maxAttempts) return 0
    return Math.max(0, entry.lastFailureAt + lockoutMs - now())
  }

  return {
    isLocked: (key) => remainingMs(key) > 0,

    reserve: (key) => {
      const locked = remainingMs(key)
      if (locked > 0) {
        // Rounded up, so a caller told to wait N seconds is never still
        // locked when it returns.
        return { ok: false, retryAfterSeconds: Math.ceil(locked / 1000) }
      }
      prune()
      const entry = current(key)
      // Delete-then-set so the Map's insertion order tracks recency, which
      // is what the size-cap eviction above relies on.
      entries.delete(key)
      entries.set(key, {
        failures: (entry?.failures ?? 0) + 1,
        lastFailureAt: now(),
      })
      return { ok: true, retryAfterSeconds: 0 }
    },

    release: (key) => {
      const entry = current(key)
      if (!entry) return
      if (entry.failures <= 1) {
        entries.delete(key)
        return
      }
      // The timestamp is left alone: giving a slot back should not also
      // extend the window the remaining failures live in.
      entries.set(key, {
        failures: entry.failures - 1,
        lastFailureAt: entry.lastFailureAt,
      })
    },

    recordSuccess: (key) => {
      entries.delete(key)
    },
  }
}
