import { describe, expect, it } from 'vitest'
import { limitConcurrency } from '../src/caldav/limit-concurrency'

/** A call whose completion the test controls. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('limitConcurrency', () => {
  // The whole point (issue #24): Bun's fetch stalls above ~7 concurrent
  // requests to one host, so the gateway must never exceed the cap no
  // matter how many callers pile in at once.
  it('never runs more than the limit at once', async () => {
    let active = 0
    let peak = 0
    const gates = Array.from({ length: 10 }, () => deferred())
    const limited = limitConcurrency(async (index: number) => {
      active += 1
      peak = Math.max(peak, active)
      await gates[index]!.promise
      active -= 1
      return index
    }, 3)

    const all = Promise.all(gates.map((_, index) => limited(index)))
    // Let everything that can start, start.
    await Promise.resolve()
    await Promise.resolve()
    expect(peak).toBeLessThanOrEqual(3)

    for (const gate of gates) gate.resolve()
    await all
    expect(peak).toBe(3)
  })

  it('runs everything and returns each caller its own result', async () => {
    const limited = limitConcurrency((n: number) => Promise.resolve(n * 2), 2)
    const results = await Promise.all([1, 2, 3, 4, 5].map(limited))
    expect(results).toEqual([2, 4, 6, 8, 10])
  })

  // A queue that leaks slots on failure would wedge after `limit`
  // rejections — every later request would wait forever, which on the
  // request path means a hung panel rather than an error.
  it('releases the slot when a call rejects', async () => {
    const limited = limitConcurrency(async (ok: boolean) => {
      if (!ok) throw new Error('nope')
      return 'fine'
    }, 1)

    await expect(limited(false)).rejects.toThrow('nope')
    await expect(limited(false)).rejects.toThrow('nope')
    // The queue still works after two failures in a row.
    await expect(limited(true)).resolves.toBe('fine')
  })

  it('lets a rejection reach its own caller, not a neighbour', async () => {
    const limited = limitConcurrency(async (n: number) => {
      if (n === 2) throw new Error(`failed ${n}`)
      return n
    }, 2)
    const settled = await Promise.allSettled([1, 2, 3].map(limited))
    expect(settled.map((r) => r.status)).toEqual([
      'fulfilled',
      'rejected',
      'fulfilled',
    ])
  })

  // FIFO, so a burst can't starve whatever queued first.
  it('admits waiting calls in the order they arrived', async () => {
    const started: number[] = []
    const gates = Array.from({ length: 4 }, () => deferred())
    const limited = limitConcurrency(async (index: number) => {
      started.push(index)
      await gates[index]!.promise
    }, 1)

    const all = Promise.all(gates.map((_, index) => limited(index)))
    for (const gate of gates) {
      await Promise.resolve()
      gate.resolve()
      await Promise.resolve()
    }
    await all
    expect(started).toEqual([0, 1, 2, 3])
  })
})
