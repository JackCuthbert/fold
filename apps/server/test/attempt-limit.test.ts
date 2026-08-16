import { describe, expect, it } from 'vitest'
import {
  attemptKey,
  makeAttemptLimiter,
  MAX_ATTEMPTS,
} from '../src/auth/attempt-limit'

// docs/specs/security.md — a cap on failed sign-in attempts, so the BFF
// cannot be used as an anonymous credential-testing relay (issue #43).
describe('attemptKey', () => {
  it('treats cosmetic URL differences as the same target', () => {
    // Otherwise an attacker sidesteps the cap entirely by varying the
    // trailing slash or host casing between guesses.
    const canonical = attemptKey('https://dav.example.com/u/', 'jack')
    expect(attemptKey('https://dav.example.com/u', 'jack')).toBe(canonical)
    expect(attemptKey('https://DAV.Example.com/u/', 'jack')).toBe(canonical)
  })

  it('treats a different path or user as a different target', () => {
    // One host commonly serves many principals, so the path is identity.
    const base = attemptKey('https://dav.example.com/u/', 'jack')
    expect(attemptKey('https://dav.example.com/other/', 'jack')).not.toBe(base)
    expect(attemptKey('https://dav.example.com/u/', 'someone')).not.toBe(base)
  })

  it('cannot be confused by a username containing the separator', () => {
    // The key joins URL and username; if a crafted username could forge
    // that join, two distinct targets would share one counter.
    expect(attemptKey('https://a.example/x', 'b https://a.example')).not.toBe(
      attemptKey('https://a.example/x b', 'https://a.example'),
    )
  })

  it('records nothing readable — no URL or username in the key', () => {
    // The map is process state that can reach a heap dump; the same
    // reasoning that keeps the access log free of both.
    const key = attemptKey('https://dav.example.com/jack/', 'jack')
    expect(key).not.toContain('dav.example.com')
    expect(key).not.toContain('jack')
    expect(key).toMatch(/^[0-9a-f]{8}$/)
  })

  it('survives a serverUrl that is not a parseable URL', () => {
    // zod rejects these before the handler, but the key must not throw if
    // it is ever called on unvalidated input.
    expect(() => attemptKey('not a url', 'jack')).not.toThrow()
  })
})

describe('makeAttemptLimiter', () => {
  const KEY = attemptKey('https://dav.example.com/u/', 'jack')

  it('allows attempts up to the cap, then refuses', () => {
    const limiter = makeAttemptLimiter()
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      expect(limiter.reserve(KEY).ok).toBe(true)
    }
    const refused = limiter.reserve(KEY)
    expect(refused.ok).toBe(false)
    expect(refused.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('bounds an attacker regardless of how fast they fire', () => {
    // The whole point of a cap over a delay: parallel guessing does not
    // get more attempts than serial guessing.
    const limiter = makeAttemptLimiter()
    let allowed = 0
    for (let i = 0; i < 500; i += 1) {
      if (limiter.reserve(KEY).ok) allowed += 1
    }
    expect(allowed).toBe(MAX_ATTEMPTS)
  })

  it('counts a reservation before the attempt resolves', () => {
    // The bug this shape exists to prevent: with check-then-record, every
    // request in a concurrent burst reads the counter before any writes,
    // so all of them pass. Reserving up front means slots are consumed
    // even while the upstream calls are still in flight.
    const limiter = makeAttemptLimiter()
    const inFlight = Array.from({ length: 40 }, () => limiter.reserve(KEY))
    expect(inFlight.filter((r) => r.ok)).toHaveLength(MAX_ATTEMPTS)
  })

  it('gives a slot back when the attempt proved nothing', () => {
    // An unreachable server must not burn an attempt.
    const limiter = makeAttemptLimiter()
    for (let i = 0; i < 20; i += 1) {
      const slot = limiter.reserve(KEY)
      if (slot.ok) limiter.release(KEY)
    }
    // Every reservation was handed back, so the full allowance remains.
    let allowed = 0
    for (let i = 0; i < MAX_ATTEMPTS + 5; i += 1) {
      if (limiter.reserve(KEY).ok) allowed += 1
    }
    expect(allowed).toBe(MAX_ATTEMPTS)
  })

  it('release does not extend the window the failures live in', () => {
    // Handing a slot back should not also refresh the expiry clock, or a
    // steady trickle of unreachable-server attempts would keep a nearly
    // full counter alive indefinitely.
    let now = 1_000_000
    const limiter = makeAttemptLimiter({ now: () => now, lockoutMs: 60_000 })
    limiter.reserve(KEY)
    limiter.reserve(KEY)
    const at = now

    now = at + 30_000
    limiter.reserve(KEY)
    limiter.release(KEY)

    // Two failures remain, still stamped at their original time.
    now = at + 1
    for (let i = 0; i < MAX_ATTEMPTS - 2; i += 1) {
      expect(limiter.reserve(KEY).ok).toBe(true)
    }
    expect(limiter.reserve(KEY).ok).toBe(false)
  })

  it('frees the target once the lockout expires', () => {
    let now = 1_000_000
    const limiter = makeAttemptLimiter({
      now: () => now,
      lockoutMs: 60_000,
    })
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) limiter.reserve(KEY)
    expect(limiter.isLocked(KEY)).toBe(true)

    now += 59_000
    expect(limiter.isLocked(KEY)).toBe(true)
    now += 2_000
    expect(limiter.isLocked(KEY)).toBe(false)
  })

  it('reports a wait that is over when it says it is', () => {
    // Rounded up: a client told to wait N seconds must not come back to a
    // still-locked target.
    let now = 1_000_000
    const limiter = makeAttemptLimiter({ now: () => now, lockoutMs: 1_500 })
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) limiter.reserve(KEY)

    const wait = limiter.reserve(KEY).retryAfterSeconds
    expect(wait).toBe(2)
    now += wait * 1000
    expect(limiter.isLocked(KEY)).toBe(false)
  })

  it('reports no wait for a target that was never locked', () => {
    expect(makeAttemptLimiter().reserve(KEY).retryAfterSeconds).toBe(0)
  })

  it('forgives earlier fumbles once a sign-in succeeds', () => {
    // Someone who mistypes twice then gets it right must not carry a count
    // toward a lockout they will never understand.
    const limiter = makeAttemptLimiter()
    limiter.reserve(KEY)
    limiter.reserve(KEY)
    limiter.recordSuccess(KEY)

    let allowed = 0
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      if (limiter.reserve(KEY).ok) allowed += 1
    }
    expect(allowed).toBe(MAX_ATTEMPTS)
  })

  it('locks one target without touching another', () => {
    const limiter = makeAttemptLimiter()
    const other = attemptKey('https://dav.example.com/u/', 'someone-else')
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) limiter.reserve(KEY)
    expect(limiter.isLocked(KEY)).toBe(true)
    expect(limiter.isLocked(other)).toBe(false)
  })

  it('does not grow without bound when the key is attacker-chosen', () => {
    // The key comes from a request body, so an unbounded map would turn a
    // brute-force defence into a memory-exhaustion vector.
    let now = 1_000_000
    const limiter = makeAttemptLimiter({ now: () => now })
    for (let i = 0; i < 25_000; i += 1) {
      limiter.reserve(attemptKey(`https://host-${i}.example/u/`, 'a'))
      // Spread across time so pruning has expired entries to collect.
      now += 100
    }
    // A real target locked at the end still works — eviction dropped the
    // stale entries, not the live one.
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) limiter.reserve(KEY)
    expect(limiter.isLocked(KEY)).toBe(true)
  })
})
