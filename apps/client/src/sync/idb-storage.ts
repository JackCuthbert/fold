import { unreadableStorage, type OutboxStorage } from '@fold/outbox'
import { get, set } from 'idb-keyval'
import { MOUNT_DEADLINE_MS, withDeadline } from '../lib'

export function idbStorage(key = 'fold-outbox'): OutboxStorage {
  return {
    load: async () => (await get<unknown[]>(key)) ?? [],
    save: (entries) => set(key, [...entries]),
  }
}

/** Distinguishes "the read timed out" from "the queue is genuinely empty". */
const TIMED_OUT = Symbol('outbox load timed out')

/**
 * Open the outbox's storage, giving up on a read that never settles.
 *
 * docs/specs/sync-and-offline.md — anything awaited before mount needs a
 * deadline. `Outbox.open` awaits `load()`, `createSyncEngine` awaits that,
 * and `AppProviders` renders nothing until the engine exists — so an
 * IndexedDB that *hangs* rather than fails (a blocked `deleteDatabase` in
 * another tab leaves every subsequent `open` pending) means the app never
 * mounts at all: a blank page with no error. Issue #7 deadlined the query
 * cache's restore; this is the same hazard on an independent, earlier path
 * (issue #17).
 *
 * Timing out must **not** degrade to an ordinary empty store. The queued
 * mutations are still on disk, unread, and the next `save()` would
 * overwrite them with the empty queue — turning a transient failure into
 * permanent data loss. `unreadableStorage` refuses every write instead, so
 * the on-disk queue survives and each refusal reaches `onPersistError`,
 * which is what tells the user their changes aren't being written down.
 */
export async function openOutboxStorage(key?: string): Promise<{
  storage: OutboxStorage
  /** True when the read timed out and writes are being refused. */
  degraded: boolean
}> {
  const real = idbStorage(key)
  const loaded: unknown = await withDeadline<unknown>(
    real.load(),
    TIMED_OUT,
    MOUNT_DEADLINE_MS,
    // A rejection is a broken database rather than a hanging one, but the
    // consequence for the queue on disk is the same: don't overwrite it.
  ).catch(() => TIMED_OUT)

  if (loaded === TIMED_OUT) {
    return { storage: unreadableStorage(), degraded: true }
  }
  // Hand back what was already read rather than reading twice: the second
  // read could hang where the first didn't, and it would be a needless
  // round trip on the mount path.
  return {
    storage: {
      load: () => Promise.resolve(loaded),
      // Arrow, not a bare reference: `save` must keep `real` as its
      // receiver.
      save: (entries) => real.save(entries),
    },
    degraded: false,
  }
}
