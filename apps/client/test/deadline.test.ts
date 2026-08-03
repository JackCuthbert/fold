import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MOUNT_DEADLINE_MS, withDeadline } from '../src/deadline'

// docs/specs/sync-and-offline.md — "Anything awaited before mount needs a
// deadline". An IndexedDB read can hang forever instead of rejecting, and
// both pre-mount awaits (the storage-key migration and the query cache's
// `restoreClient`) block the first render on one. Without a deadline the
// user gets a blank page with no error and no way back short of clearing
// site data — the defect reproduced on 2026-08-03 (#7).
describe('withDeadline', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('gives up on a promise that never settles and yields the fallback', async () => {
    const wedged = new Promise<string>(() => {})
    const settled = withDeadline(wedged, 'empty cache')
    await vi.advanceTimersByTimeAsync(MOUNT_DEADLINE_MS)
    await expect(settled).resolves.toBe('empty cache')
  })

  it('waits for work that settles in time, keeping the real value', async () => {
    const restored = withDeadline(Promise.resolve('restored'), 'empty cache')
    await vi.advanceTimersByTimeAsync(MOUNT_DEADLINE_MS * 2)
    await expect(restored).resolves.toBe('restored')
  })

  it('still surfaces a rejection rather than masking it as the fallback', async () => {
    const failed = withDeadline(
      Promise.reject(new Error('quota exceeded')),
      'empty cache',
    )
    await expect(failed).rejects.toThrow('quota exceeded')
  })

  it('resolves before the deadline when the work does', async () => {
    let done = false
    const slow = new Promise<string>((resolve) =>
      setTimeout(() => resolve('restored'), MOUNT_DEADLINE_MS / 2),
    )
    const settled = withDeadline(slow, 'empty cache').finally(() => {
      done = true
    })
    await vi.advanceTimersByTimeAsync(MOUNT_DEADLINE_MS / 2)
    expect(done).toBe(true)
    await expect(settled).resolves.toBe('restored')
  })
})
