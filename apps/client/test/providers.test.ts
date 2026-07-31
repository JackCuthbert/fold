import { describe, expect, it } from 'vitest'
import { queryClient } from '../src/providers'

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
