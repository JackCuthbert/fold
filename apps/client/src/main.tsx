import { createRoot } from 'react-dom/client'
import { App } from './app'
import { migrateStorageKeys } from './storage-migration'
import './styles/global.css'
import { publishScrollbarGutter } from './styles/scrollbar-gutter'

// Measure the platform's scrollbar width before first paint so the sticky
// header can reserve the same gutter its scrolling sibling does
// (docs/specs/ui.md — one left edge).
publishScrollbarGutter()

// The migration reads IndexedDB, and an IndexedDB request does not always
// fail — it can simply never settle, e.g. while a `deleteDatabase` from
// another tab is blocked on this one's open connection. `catch` only covers
// rejection, so without a deadline a wedged database means the app never
// mounts at all: a blank page, no error, nothing to act on. Losing the
// migration is recoverable (it re-runs next load, and is written to be
// safely repeatable); losing the whole UI is not.
const MIGRATION_DEADLINE_MS = 2000

const withDeadline = (work: Promise<unknown>): Promise<unknown> =>
  Promise.race([
    work,
    new Promise((resolve) => setTimeout(resolve, MIGRATION_DEADLINE_MS)),
  ])

const root = document.getElementById('root')
if (root) {
  // Move persisted state off the pre-rename keys *before* mounting: the
  // outbox may hold unsynced mutations, and the sync engine starts reading
  // it as soon as the tree renders. Mounting first would race the move.
  const container = root
  void withDeadline(
    migrateStorageKeys().catch((error: unknown) => {
      console.error('storage key migration failed', error)
    }),
  ).finally(() => {
    createRoot(container).render(<App />)
  })
}
