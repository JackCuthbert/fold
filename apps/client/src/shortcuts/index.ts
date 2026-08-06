/**
 * The keyboard shortcut map, its matching rules and the keycaps that draw
 * it (docs/specs/ui.md — keyboard shortcuts, issue #5).
 */
export {
  SHORTCUTS,
  hasPrimaryModifier,
  isActionAvailable,
  isTextEntry,
  isTextEntryTarget,
  matchShortcut,
  shortcutLetter,
  viewIndexOf,
  type Shortcut,
  type ShortcutAction,
  type ShortcutContext,
  type TextEntryTarget,
} from './lib/shortcuts'
export { ShortcutKeys } from './shortcut-keys/shortcut-keys'
export { useModifierHeld } from './hooks/use-modifier-held'
export { useShortcuts } from './hooks/use-shortcuts'
