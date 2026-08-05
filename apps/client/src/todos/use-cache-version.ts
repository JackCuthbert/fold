import { useQueryClient } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'

// One counter, bumped on every query-cache event, shared by every hook
// that needs to re-render when cached todos change.
//
// It has to be shared. Two hooks each owning a module-scope counter but
// subscribing with *different* filters is a bug that took a while to
// find: `useSyncExternalStore` compares snapshots by identity, so a
// counter that moves without the corresponding subscriber firing leaves
// React with a changed snapshot and no notification — and it bails out of
// the render entirely. That is what stopped a list reorder from ever
// reaching the screen while both hooks were mounted.
//
// The subscription is deliberately unfiltered. A narrower one is what
// created the mismatch in the first place, and the work here is a counter
// increment — the cost of an extra render is a few pure functions over
// todos already in memory, which is far cheaper than the class of bug
// that filtering invites.
// *(added 2026-08-05.)*
let cacheVersion = 0

/**
 * Re-render whenever anything in the query cache changes.
 *
 * Returns nothing useful — callers read what they need from the cache
 * afterwards. Its only job is to be a value that changed.
 */
export function useCacheVersion(): void {
  const queryClient = useQueryClient()
  // The counter is bumped by the *subscription*, never by the read:
  // `getSnapshot` must be pure or React re-renders forever.
  useSyncExternalStore(
    (onChange) =>
      queryClient.getQueryCache().subscribe(() => {
        cacheVersion += 1
        onChange()
      }),
    () => cacheVersion,
  )
}
