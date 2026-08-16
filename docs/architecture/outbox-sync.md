# Decision: Client-owned outbox instead of TanStack mutation persistence

Implements [specs/sync-and-offline](../specs/sync-and-offline.md).

Reads use TanStack Query persisted to IndexedDB. Writes go through our own
durable FIFO outbox (`packages/outbox`) drained by a `SyncLoop` with
exponential backoff; mutations are zod-validated on load and coalesced on
enqueue (`apps/client/src/sync/coalesce.ts`).

**Why not TanStack's paused-mutation persistence?** Resumed mutations
don't survive reloads reliably without significant custom glue, ordering
across entities is implicit, and coalescing isn't expressible. The outbox
makes ordering, durability, and merging explicit and unit-testable.

**Conflict policy:** last-write-wins. Updates carry ETags; a 412 returns
the fresh copy, the client rebases once, then drops with a toast
(`apps/client/src/sync/process.ts`).

**Consequences:** `packages/outbox` is generic and publishable; sync
behavior is tested without a browser.
