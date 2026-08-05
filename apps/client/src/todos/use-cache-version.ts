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
 *
 * **The notification is deferred to a microtask, never delivered inline.**
 * Some cache writes happen *during* a render: a pane's `queryFn` stores
 * the raw server response for its ctag (use-today-todos.ts, todo-pane.tsx)
 * and `QueryCache.notify` then calls every subscriber synchronously. The
 * subscribers here live in MainScreen — `useViewCount` and
 * `useListActiveTodos` — so React saw a parent being updated while a child
 * was still rendering, and said so on every view switch:
 *
 *     Cannot update a component (`MainScreen`) while rendering a
 *     different component (`TodayPane`).
 *
 * Deferring puts the update after the render that provoked it, which is
 * where it always belonged: nothing here needs to be synchronous, because
 * the counter is only ever read to *notice a change*, not to supply a
 * value the render depends on.
 *
 * Deliberately not solved by filtering the subscription — see above; and
 * not by moving the ctag out of the query cache, which is the deeper fix
 * (the raw entry is bookkeeping that nothing renders) but a change to how
 * sync stores its state rather than to how the UI observes it.
 * *(fixed 2026-08-05: the warning fired on every switch between views.)*
 */
export function useCacheVersion(): void {
  const queryClient = useQueryClient()
  // The counter is bumped by the *subscription*, never by the read:
  // `getSnapshot` must be pure or React re-renders forever.
  useSyncExternalStore(
    (onChange) =>
      queryClient.getQueryCache().subscribe(() => {
        cacheVersion += 1
        // Coalesces naturally: several writes in one tick bump the
        // counter several times but schedule one notification each, and
        // React batches the resulting renders.
        queueMicrotask(onChange)
      }),
    () => cacheVersion,
  )
}
