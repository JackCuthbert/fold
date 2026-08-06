import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MOUNT_DEADLINE_MS } from '../../lib/deadline/deadline'
import { openOutboxStorage } from './idb-storage'

// Issue #17. `Outbox.open` awaits `load()`, `createSyncEngine` awaits that,
// and `AppProviders` renders nothing until the engine exists — so an
// IndexedDB that hangs rather than rejects means the app never mounts: a
// blank page with no error and no way back. Issue #7 closed the same hazard
// on the query-cache path; this is the independent, earlier one.
vi.mock('idb-keyval', () => ({
  get: vi.fn(),
  set: vi.fn(),
}))

const { get, set } = await import('idb-keyval')

describe('openOutboxStorage', () => {
  beforeEach(() => {
    vi.mocked(get).mockReset()
    vi.mocked(set).mockReset()
  })
  afterEach(() => vi.useRealTimers())

  it('returns the stored queue when IndexedDB answers', async () => {
    vi.mocked(get).mockResolvedValue([{ id: 'a' }])
    const { storage, degraded } = await openOutboxStorage('k')
    expect(degraded).toBe(false)
    await expect(storage.load()).resolves.toEqual([{ id: 'a' }])
  })

  it('treats a missing key as an empty queue, not a failure', async () => {
    vi.mocked(get).mockResolvedValue(undefined)
    const { storage, degraded } = await openOutboxStorage('k')
    expect(degraded).toBe(false)
    await expect(storage.load()).resolves.toEqual([])
  })

  it('still writes through to IndexedDB when healthy', async () => {
    vi.mocked(get).mockResolvedValue([])
    vi.mocked(set).mockResolvedValue(undefined)
    const { storage } = await openOutboxStorage('k')
    await storage.save([{ id: 'b' }])
    expect(set).toHaveBeenCalledWith('k', [{ id: 'b' }])
  })

  // The blank page, reproduced: `get` is issued and simply never settles.
  it('gives up on a read that never settles, so the app can mount', async () => {
    vi.useFakeTimers()
    vi.mocked(get).mockReturnValue(new Promise(() => {}))
    const opening = openOutboxStorage('k')
    await vi.advanceTimersByTimeAsync(MOUNT_DEADLINE_MS)
    const { storage, degraded } = await opening
    expect(degraded).toBe(true)
    await expect(storage.load()).resolves.toEqual([])
  })

  // The heart of #17: the queue is still on disk, unread. An ordinary
  // empty store would let the next save overwrite it — turning
  // "temporarily unreadable" into "permanently destroyed".
  it('refuses to write after a timeout rather than overwriting the queue', async () => {
    vi.useFakeTimers()
    vi.mocked(get).mockReturnValue(new Promise(() => {}))
    const opening = openOutboxStorage('k')
    await vi.advanceTimersByTimeAsync(MOUNT_DEADLINE_MS)
    const { storage } = await opening
    await expect(storage.save([{ id: 'c' }])).rejects.toThrow()
    expect(set).not.toHaveBeenCalled()
  })

  // A rejection is a broken database rather than a hanging one, but the
  // consequence for the queue on disk is identical: don't overwrite it.
  it('refuses to write when the read rejected outright', async () => {
    vi.mocked(get).mockRejectedValue(new Error('database is corrupt'))
    const { storage, degraded } = await openOutboxStorage('k')
    expect(degraded).toBe(true)
    await expect(storage.save([{ id: 'd' }])).rejects.toThrow()
    expect(set).not.toHaveBeenCalled()
  })
})
