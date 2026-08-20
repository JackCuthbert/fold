import type { CommandId } from '../../commands/lib/commands'
import { DERIVED_VIEWS } from '../../todos/lib/today'

/**
 * Keyboard shortcuts (docs/specs/ui.md — keyboard shortcuts, issue #5).
 *
 * The matching and the should-this-fire decision are pure functions here,
 * separate from the listener hook, because they are the part worth testing
 * without a DOM: "does Cmd+N fire while a dialog is open" is a rule, not a
 * rendering concern (CLAUDE.md — test behavior over shape).
 */

/**
 * The actions a shortcut can request.
 *
 * An alias of `CommandId` rather than a narrower union of its own: a
 * shortcut runs a command, and every command is a legitimate thing to bind
 * a key to. Keeping a second list here would mean two places to add a
 * member, which is the drift this refactor removes.
 * *(changed 2026-08-20, issue #26: was its own four-member union.)*
 */
export type ShortcutAction = CommandId

export { viewIndexOf } from '../../commands/lib/commands'

export interface Shortcut {
  /**
   * `event.code` — the *physical* key, e.g. `KeyK`, `Digit1`, `Slash`.
   *
   * Not `event.key`, which reports what the key *produces* once modifiers
   * are applied: Shift+1 is `"!"`, and on a Mac Option+1 is `"¡"`. A digit
   * binding matched on `key` would simply never fire, silently. `code`
   * describes the key you actually press, so a chord means the same thing
   * whatever the modifiers or the keyboard layout do to it.
   * *(changed 2026-08-04: was `event.key`, which cannot express a
   * shifted digit.)*
   */
  code: string
  /** Ctrl on every platform — see `hasPrimaryModifier`. */
  primary: boolean
  shift: boolean
  /**
   * The command this key runs (commands/lib/commands.ts).
   *
   * A reference rather than a name of its own. It used to carry a
   * `description`, which meant the name of an action lived here *and*
   * wherever else it was shown — so the palette and the help modal could
   * drift apart. Naming the command instead leaves one source for it.
   * *(changed 2026-08-20, issue #26.)*
   */
  command: CommandId
}

/**
 * What is printed on the keycap for this binding.
 *
 * Derived from `code` rather than stored: the modifiers are already
 * described by `primary` and `shift`, and `ShortcutKeys` draws those
 * separately. A `label` field held the same information twice and had
 * already drifted once. *(changed 2026-08-04.)*
 */
export function shortcutLetter(shortcut: Shortcut): string {
  const { code } = shortcut
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  // Punctuation and anything else: spelled out in the map below rather
  // than guessed at from a code name like "Slash".
  return PRINTED_KEY[code] ?? code
}

/** How to print the keys whose `code` name isn't the glyph itself. */
const PRINTED_KEY: Record<string, string> = {
  Slash: '/',
  Period: '.',
  Comma: ',',
  Semicolon: ';',
}

/**
 * The whole map, in one place.
 *
 * `Cmd/Ctrl+F` is still deliberately absent now that the search view exists
 * (issue #6). It reaches the same place `Ctrl+Shift+4` does, so binding it
 * would buy a second route to one view at the cost of the browser's own
 * find — which is the right tool for "where is that word on this screen",
 * a genuinely different question from the one the view answers.
 * *(reconsidered 2026-08-06 when the view landed, and kept.)*
 */
const BASE_SHORTCUTS: readonly Shortcut[] = [
  {
    command: 'new-todo',
    // **N, with no modifier.** The first modifier-less binding in the map.
    //
    // It was `Ctrl+K`, held in reserve for the command palette (issue #26)
    // on the theory that the palette would replace this chord and inherit
    // its muscle memory. Quick add makes that wrong: it is not a stepping
    // stone to a palette, it is the feature people use ten times a day,
    // and it should not surrender the key it earned to something that does
    // not exist yet. K is now genuinely free for the palette.
    //
    // Modifier-less because every modified form of N is spoken for:
    // `Cmd+N` is a new window on macOS, `Ctrl+N` the same on Windows and
    // Linux, and `Ctrl+N` is *also* taken inside quick add itself, where
    // it walks the `#` autocomplete. A bare letter has none of those
    // collisions, and it is what Linear, Height and GitHub use for exactly
    // this action.
    //
    // Safe because shortcuts already stand down while a field has focus
    // (`isTextEntryTarget`, applied in use-shortcuts.ts) — the guard was
    // written for "the modifier-less bindings the map may grow later",
    // which is this one. The cost: `useModifierHeld` reveals keycaps only
    // while Ctrl is down, so this binding is not advertised in the nav and
    // is discoverable through Help alone.
    // *(changed 2026-08-14.)*
    code: 'KeyN',
    primary: false,
    shift: false,
  },
  {
    command: 'new-list',
    code: 'KeyN',
    primary: true,
    shift: true,
  },
  {
    // **K, the near-universal quick-action chord** (Linear, Slack, Notion,
    // GitHub). Reserved for this since 2026-08-14, when quick add moved to
    // a bare `N` specifically to release it — the palette was the reason
    // given at the time (issue #26).
    //
    // `Ctrl`, not `Cmd`, like every other chord here: `metaKey` is not
    // accepted anywhere in this map, so `Cmd+K` cannot shadow whatever the
    // browser does with it (see `hasPrimaryModifier`).
    command: 'palette',
    code: 'KeyK',
    primary: true,
    shift: false,
  },
  {
    command: 'help',
    code: 'Slash',
    primary: true,
    shift: false,
    // What it opens, not what it contains: this chord is listed *inside*
    // the modal it opens, where "Keyboard shortcuts" read as a pointer to
    // the section it was already sitting in.
    // *(changed 2026-08-04.)*
  },
  // The derived views are appended below, one chord each.
]

/**
 * `Ctrl+Shift+<n>` for the nth derived view.
 *
 * Generated from DERIVED_VIEWS rather than written out, so adding a view
 * gives it a chord without touching this file — and *only* derived views
 * get one. Real lists are deliberately excluded: they are created and
 * deleted freely, so a positional chord would change meaning under the
 * user. They are reachable by name from the command palette instead
 * (issue #26).
 *
 * Shift is what makes a digit usable at all: plain Ctrl+1 is taken twice
 * over on a Mac — by the OS for switching Spaces, and again by some
 * browsers for switching tabs — so the keydown never arrives. Matched on
 * `code` (`Digit1`), which is the other half of why this works: Shift+1
 * reports `event.key` as "!", so a `key`-based binding would never fire.
 *
 * Digits stop at 9. `Digit0` would be a tenth view reached by a key that
 * reads as zero, which is worse than that view having no chord at all.
 *
 * *(added 2026-08-04.)*
 */
const VIEW_SHORTCUTS: readonly Shortcut[] = DERIVED_VIEWS.slice(0, 9).map(
  (_view, index) => ({
    command: `go-view:${index + 1}` as const,
    code: `Digit${index + 1}`,
    primary: true,
    shift: true,
  }),
)

/** The whole map: the fixed actions, then one chord per derived view. */
export const SHORTCUTS: readonly Shortcut[] = [
  ...BASE_SHORTCUTS,
  ...VIEW_SHORTCUTS,
]

/**
 * **Ctrl on every platform, including macOS.**
 *
 * The conventional advice is Cmd on a Mac and Ctrl elsewhere, and this did
 * that until 2026-08-04. Two things argued it down:
 *
 * - The chords worth having kept colliding. `Cmd+N` is the browser's, and
 *   `Cmd`/`Ctrl` + a digit is taken twice over on macOS — by the OS for
 *   Spaces and again by the browser for tabs. Ctrl+Shift is the one
 *   combination with room left in it.
 * - It is one family rather than two. No platform branch in the binding,
 *   no platform branch in the label, and a keycap that reads "Ctrl"
 *   everywhere is a chord you can tell someone over the phone.
 *
 * The cost is real and deliberate: Ctrl is not the native modifier on
 * macOS, so this departs from what a Mac user expects. Fold is personal
 * software written for someone who lives in vim, where Ctrl is home
 * (README — personal software).
 *
 * `metaKey` is deliberately *not* accepted as an alternative: Cmd+K would
 * then shadow whatever the browser or OS does with it, which is the class
 * of collision this whole change exists to escape.
 */
export function hasPrimaryModifier(
  event: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey'>,
): boolean {
  return event.ctrlKey && !event.metaKey
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

/**
 * The action this event asks for, or null.
 *
 * Matched on `event.code` — see the `code` field. No platform argument any
 * more: the modifier is Ctrl everywhere (`hasPrimaryModifier`).
 */
export function matchShortcut(
  event: Pick<KeyboardEvent, 'code' | 'metaKey' | 'ctrlKey' | 'shiftKey'>,
): ShortcutAction | null {
  for (const shortcut of SHORTCUTS) {
    if (shortcut.code !== event.code) continue
    if (shortcut.primary !== hasPrimaryModifier(event)) continue
    if (shortcut.shift !== event.shiftKey) continue
    return shortcut.command
  }
  return null
}
