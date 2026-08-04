/**
 * Keyboard shortcuts (docs/specs/ui.md — keyboard shortcuts, issue #5).
 *
 * The matching and the should-this-fire decision are pure functions here,
 * separate from the listener hook, because they are the part worth testing
 * without a DOM: "does Cmd+N fire while a dialog is open" is a rule, not a
 * rendering concern (CLAUDE.md — test behavior over shape).
 */

/** The actions a shortcut can request. One per binding. */
export type ShortcutAction = 'new-todo' | 'new-list' | 'help'

export interface Shortcut {
  action: ShortcutAction
  /** `event.key`, lowercased. */
  key: string
  /** Cmd on macOS, Ctrl elsewhere — see `hasPrimaryModifier`. */
  primary: boolean
  shift: boolean
  /** How the help modal writes it, minus the platform's modifier glyphs. */
  label: string
  description: string
}

/**
 * The whole map, in one place.
 *
 * `Cmd/Ctrl+F` for search is deliberately absent: it belongs to the search
 * view, which does not exist yet (issue #6), and binding it now would take
 * the browser's own find away and give nothing back.
 */
export const SHORTCUTS: readonly Shortcut[] = [
  {
    action: 'new-todo',
    key: 'n',
    primary: true,
    shift: false,
    label: 'N',
    description: 'New todo',
  },
  {
    action: 'new-list',
    key: 'n',
    primary: true,
    shift: true,
    label: 'Shift N',
    description: 'New list',
  },
  {
    action: 'help',
    key: '/',
    primary: true,
    shift: false,
    label: '/',
    description: 'Keyboard shortcuts',
  },
]

/**
 * Whether this machine uses Cmd rather than Ctrl.
 *
 * One definition, because two would drift: the binding
 * (`use-shortcuts.ts`) and the label the help modal prints must agree, or
 * the app documents a chord that does nothing. `navigator.platform` is
 * deprecated but remains the most reliable signal available —
 * `userAgentData` is Chromium-only, so it is a hint rather than an answer.
 */
export function isApplePlatform(): boolean {
  return /mac|iphone|ipad|ipod/i.test(navigator.platform)
}

/** How this platform writes the primary modifier, for display. */
export function modifierLabel(isApple: boolean): string {
  return isApple ? '⌘' : 'Ctrl+'
}

/**
 * Cmd on Apple platforms, Ctrl everywhere else.
 *
 * Testing both `metaKey` and `ctrlKey` against the platform — rather than
 * accepting either — keeps Ctrl+N free to mean "new window" on macOS,
 * where that is what it does everywhere else in the OS.
 */
export function hasPrimaryModifier(
  event: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey'>,
  isApple: boolean,
): boolean {
  return isApple ? event.metaKey : event.ctrlKey
}

/**
 * The bits of an element this module needs to judge text entry. Structural
 * rather than `HTMLElement` so the rule can be tested without a DOM — the
 * client's unit tests run in plain Node (no jsdom).
 */
export interface TextEntryTarget {
  tagName?: string | undefined
  isContentEditable?: boolean | undefined
}

/**
 * Whether the event is typing into somewhere text goes.
 *
 * A shortcut must never steal a keystroke from a field. That matters most
 * for the modifier-less bindings the map may grow later, but it is the
 * right default now: `Cmd+N` inside the summary field of the add-todo
 * modal should be the browser's, not ours.
 */
export function isTextEntry(target: TextEntryTarget | null): boolean {
  if (!target) return false
  if (target.isContentEditable === true) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/**
 * `isTextEntry` for a DOM event's target, which is an `EventTarget` and so
 * may not be an element at all (the document itself, for one). Narrowed
 * with `instanceof` rather than cast — a keydown that did not come from an
 * element is simply not text entry.
 */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return isTextEntry(target)
}

/** What the app is doing, as far as a shortcut needs to care. */
export interface ShortcutContext {
  /** Any dialog is open — add-todo, list form, settings, help, confirm. */
  dialogOpen: boolean
  /** A real list is selected, so there is a collection to add a todo to. */
  canAddTodo: boolean
}

/**
 * Whether `action` should fire right now.
 *
 * The rule the issue settles: a shortcut does nothing when its button is
 * unreachable, *except* that a closed nav is not "unreachable" — the nav
 * being collapsed or off-screen on mobile is exactly when reaching for the
 * keyboard is most useful, so New list still works there.
 *
 * A dialog, by contrast, does obscure things: `Cmd+N` inside the detail
 * panel or another modal must not stack a second one on top.
 */
export function isActionAvailable(
  action: ShortcutAction,
  context: ShortcutContext,
): boolean {
  // Help is the exception that proves the rule: it is *itself* a dialog,
  // and the one thing you should be able to reach when lost. It still
  // stands down while another dialog is open rather than stacking.
  if (context.dialogOpen) return false
  // Today and Summary are derived views, not collections — there is no
  // list for a new todo to go into (docs/specs/today-view.md).
  if (action === 'new-todo') return context.canAddTodo
  return true
}

/** The action this event asks for, or null. */
export function matchShortcut(
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey'>,
  isApple: boolean,
): ShortcutAction | null {
  const key = event.key.toLowerCase()
  for (const shortcut of SHORTCUTS) {
    if (shortcut.key !== key) continue
    if (shortcut.primary !== hasPrimaryModifier(event, isApple)) continue
    if (shortcut.shift !== event.shiftKey) continue
    return shortcut.action
  }
  return null
}
