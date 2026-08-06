import { createRoot } from 'react-dom/client'
import { App } from './app'
import { withDeadline } from './lib/deadline/deadline'
import { migrateStorageKeys } from './lib/storage-migration/storage-migration'
import './styles/global.css'
import { publishScrollbarGutter } from './styles/scrollbar-gutter'

// Measure the platform's scrollbar width before first paint so the sticky
// header can reserve the same gutter its scrolling sibling does
// (docs/specs/ui.md — one left edge).
publishScrollbarGutter()

const root = document.getElementById('root')
if (root) {
  // Move persisted state off the pre-rename keys *before* mounting: the
  // outbox may hold unsynced mutations, and the sync engine starts reading
  // it as soon as the tree renders. Mounting first would race the move.
  const container = root
  // The migration reads IndexedDB, so it gets a deadline: losing it is
  // recoverable (it re-runs next load, and is written to be safely
  // repeatable), losing the whole UI is not — see ./deadline.ts.
  void withDeadline(
    migrateStorageKeys().catch((error: unknown) => {
      console.error('storage key migration failed', error)
    }),
    undefined,
  ).finally(() => {
    createRoot(container).render(<App />)
  })
}
