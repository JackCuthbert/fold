import { useEffect, useRef } from 'react'
import {
  isActionAvailable,
  isTextEntryTarget,
  matchShortcut,
  type ShortcutAction,
  type ShortcutContext,
} from '../shortcuts/shortcuts'

/**
 * One app-level listener owning the whole shortcut map.
 *
 * docs/specs/ui.md — keyboard shortcuts (issue #5). Deliberately one
 * listener rather than per-component handlers: the map is a single thing
 * the user learns and the help modal documents, so it should be a single
 * thing in the code too. Scattering it means no one place answers "what
 * does Cmd+N do here", and two components can silently claim one chord.
 *
 * The matching rules live in `shortcuts.ts` as pure functions; this hook
 * is only the wiring — attach, dispatch, detach.
 */
export function useShortcuts(
  context: ShortcutContext,
  onAction: (action: ShortcutAction) => void,
): void {
  // Held in a ref so the listener is attached once rather than re-bound on
  // every render. `context` changes on every dialog open and list switch,
  // and re-attaching a document listener that often is needless churn —
  // but the handler must still read the *current* values, not the ones it
  // closed over when it was created.
  const latest = useRef({ context, onAction })
  latest.current = { context, onAction }

  useEffect(() => {
    const handle = (event: KeyboardEvent): void => {
      // Never steal a keystroke from a field (shortcuts.ts — isTextEntry).
      if (isTextEntryTarget(event.target)) return
      const action = matchShortcut(event)
      if (action === null) return
      // Matched but unavailable — a dialog is open, or there is no list to
      // add to. Deliberately still `preventDefault()`: the chord is ours
      // either way, and letting Cmd+N fall through to "new browser window"
      // only when a modal happens to be open would be the worst kind of
      // inconsistent.
      event.preventDefault()
      if (!isActionAvailable(action, latest.current.context)) return
      latest.current.onAction(action)
    }

    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [])
}
