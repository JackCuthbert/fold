import { createRoot } from 'react-dom/client'
import { App } from './app'
import { migrateStorageKeys } from './storage-migration'
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
  // A failed migration must not leave a blank page — the app still works,
  // it just starts from defaults — so render either way.
  const container = root
  void migrateStorageKeys()
    .catch((error: unknown) => {
      console.error('storage key migration failed', error)
    })
    .finally(() => {
      createRoot(container).render(<App />)
    })
}
