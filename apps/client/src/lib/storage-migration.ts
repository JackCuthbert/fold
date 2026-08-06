import { del, get, set } from 'idb-keyval'

// One-time rename of persisted storage keys from the project's old name
// (`caldav-todo*`) to `fold*`, after the 2026-08-01 rename.
//
// Renaming a key without migrating it silently discards whatever it held.
// For the UI preferences that means a reset; for the outbox it means
// *dropping unsynced mutations* — writes the user made offline that haven't
// reached the server yet (docs/specs/sync-and-offline.md). So each key is
// copied to its new name and only then removed.
//
// Every step is guarded so a half-finished migration (a tab closed midway,
// a quota error) can be re-run safely:
//   - nothing to copy from      → skip
//   - destination already set   → skip, and still clear the source
// The destination always wins, so a newer value written under the new key
// is never clobbered by a stale one under the old.

export const LOCAL_KEYS: ReadonlyArray<readonly [from: string, to: string]> = [
  ['caldav-todo:selected-list', 'fold:selected-list'],
  ['caldav-todo:nav-pinned', 'fold:nav-pinned'],
  ['caldav-todo-muted', 'fold-muted'],
]

const OUTBOX_FROM = 'caldav-todo-outbox'
const OUTBOX_TO = 'fold-outbox'

/** The slice of the Storage interface this migration needs. */
export interface KeyValueStore {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

/** The slice of idb-keyval this migration needs. */
export interface AsyncStore {
  get: (key: string) => Promise<unknown[] | undefined>
  set: (key: string, value: unknown[]) => Promise<void>
  del: (key: string) => Promise<void>
}

export function migrateLocalStorage(store: KeyValueStore): void {
  for (const [from, to] of LOCAL_KEYS) {
    const value = store.getItem(from)
    if (value === null) continue
    if (store.getItem(to) === null) store.setItem(to, value)
    store.removeItem(from)
  }
}

/**
 * The outbox lives in IndexedDB and may hold queued mutations that have not
 * reached the server. Copy before deleting, and never overwrite a
 * destination that already has entries.
 */
export async function migrateOutbox(store: AsyncStore): Promise<void> {
  const previous = await store.get(OUTBOX_FROM)
  if (previous === undefined) return
  const current = await store.get(OUTBOX_TO)
  if (current === undefined || current.length === 0) {
    await store.set(OUTBOX_TO, previous)
  }
  await store.del(OUTBOX_FROM)
}

/**
 * Run both migrations. Safe to call on every startup: once the old keys are
 * gone it does nothing.
 *
 * localStorage is migrated synchronously so it has completed before any
 * component reads a preference. The outbox is async by nature; it is
 * awaited before the sync engine starts, so the queue is never read
 * mid-move.
 */
export async function migrateStorageKeys(): Promise<void> {
  migrateLocalStorage(localStorage)
  await migrateOutbox({ get, set, del })
}
