import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MOUNT_DEADLINE_MS } from './lib/deadline'
import { persister, queryClient } from './providers'

// Pins docs/specs/sync-and-offline.md's refetch triggers: "window focus,
// reconnect, after outbox drain, and on interval". Drain is the sync
// engine's job (engine.test.ts covers it); these three are TanStack
// Query's own job and are easy to silently regress (e.g. by moving a
// query to override the defaults) without any other test noticing, since
// every fetch already goes through queryFn/reconcile* regardless of what
// triggered it. Without a live poll, a change made on another device
// would never appear until a manual reload.
describe('queryClient defaults', () => {
  it('refetches on window focus, reconnect, and a recurring interval', () => {
    const defaults = queryClient.getDefaultOptions().queries
    expect(defaults?.refetchOnWindowFocus).toBe(true)
    expect(defaults?.refetchOnReconnect).toBe(true)
    expect(defaults?.refetchInterval).toBeTypeOf('number')
    expect(defaults?.refetchInterval).toBeGreaterThan(0)
  })
})

// #7: `PersistQueryClientProvider` renders nothing until the persister's
// restore settles, and that read goes to IndexedDB — which can hang
// forever rather than reject (an interrupted `deleteDatabase` leaves a
// pending version-change transaction, after which every `open` on the
// origin hangs). Before this deadline the app was a blank page for as long
// as the database stayed wedged: no error, no message, no way back short
// of clearing site data. docs/specs/sync-and-offline.md — "anything
// awaited before mount needs a deadline".
describe('cache restore when IndexedDB is wedged', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('gives up and reports an empty cache so the app can still mount', async () => {
    // A wedged database: `open` is issued and simply never fires an event.
    vi.stubGlobal('indexedDB', { open: () => ({}) })
    const restored = persister.restoreClient()
    await vi.advanceTimersByTimeAsync(MOUNT_DEADLINE_MS)
    // `undefined` is the persister's own "nothing persisted" answer, so
    // hydration is skipped and the tree renders with an empty cache — a
    // slower first paint, not lost data, since the client refetches.
    await expect(restored).resolves.toBeUndefined()
  })
})
