import { describe, expect, it } from 'vitest'
import {
  isActionAvailable,
  isTextEntry,
  matchShortcut,
  shortcutLetter,
  SHORTCUTS,
  type ShortcutContext,
} from '../src/shortcuts'

const press = (
  code: string,
  mods: { meta?: boolean; ctrl?: boolean; shift?: boolean } = {},
) => ({
  code,
  metaKey: mods.meta ?? false,
  ctrlKey: mods.ctrl ?? false,
  shiftKey: mods.shift ?? false,
})

const OPEN: ShortcutContext = { dialogOpen: false, canAddTodo: true }

describe('matchShortcut', () => {
  it('matches a bound chord', () => {
    expect(matchShortcut(press('KeyK', { ctrl: true }))).toBe('new-todo')
    expect(matchShortcut(press('KeyN', { ctrl: true, shift: true }))).toBe(
      'new-list',
    )
    expect(matchShortcut(press('Slash', { ctrl: true }))).toBe('help')
  })

  // Ctrl on every platform, deliberately (shortcuts.ts — hasPrimaryModifier).
  // Accepting Cmd as an alternative would shadow whatever the browser or OS
  // already does with it, which is the collision the map exists to escape.
  it('does not accept Cmd in place of Ctrl', () => {
    expect(matchShortcut(press('KeyK', { meta: true }))).toBeNull()
    // Nor both at once — that is a different chord.
    expect(matchShortcut(press('KeyK', { ctrl: true, meta: true }))).toBeNull()
  })

  it('needs a modifier at all', () => {
    expect(matchShortcut(press('KeyK'))).toBeNull()
  })

  // Shift has to be matched exactly rather than ignored: Ctrl+Shift+K
  // must not also open the new-todo form, and Ctrl+N alone must not open
  // the new-list one.
  it('matches shift exactly', () => {
    expect(matchShortcut(press('KeyK', { ctrl: true, shift: true }))).toBeNull()
    expect(matchShortcut(press('KeyN', { ctrl: true }))).toBeNull()
  })

  // The reason the map is keyed on `event.code` at all: Shift+1 reports
  // `event.key` as "!", so a key-based binding for a shifted digit would
  // never fire. `code` is the physical key, whatever the modifiers do to it.
  it('matches shifted digits, which `key` could not express', () => {
    expect(matchShortcut(press('Digit1', { ctrl: true, shift: true }))).toBe(
      'go-today',
    )
    expect(matchShortcut(press('Digit2', { ctrl: true, shift: true }))).toBe(
      'go-summary',
    )
  })

  it('does not claim keys it has no binding for', () => {
    expect(matchShortcut(press('KeyP', { ctrl: true }))).toBeNull()
    // Reserved for search, which does not exist yet (issue #6). Until it
    // does, the browser's own find must keep working.
    expect(matchShortcut(press('KeyF', { ctrl: true }))).toBeNull()
  })

  // Two bindings answering one chord would make which action fires depend
  // on array order — a bug that only shows up once someone adds the second.
  it('has no duplicate chords in the map', () => {
    const chords = SHORTCUTS.map(
      (s) => `${s.primary ? 'C' : ''}${s.shift ? 'S' : ''}:${s.code}`,
    )
    expect(new Set(chords).size).toBe(chords.length)
  })
})

// What the keycaps print (shortcut-keys.tsx). Derived from `code`, so a
// binding cannot be labelled with a key it does not use.
describe('shortcutLetter', () => {
  it('prints the key on the cap', () => {
    const printed = Object.fromEntries(
      SHORTCUTS.map((s) => [s.action, shortcutLetter(s)]),
    )
    expect(printed).toEqual({
      'new-todo': 'K',
      'new-list': 'N',
      help: '/',
      'go-today': '1',
      'go-summary': '2',
    })
  })
})

describe('isActionAvailable', () => {
  // The rule settled on issue #5: a shortcut stands down when a modal is
  // already open rather than stacking a second one on top.
  it('stands down while a dialog is open', () => {
    const context = { ...OPEN, dialogOpen: true }
    for (const { action } of SHORTCUTS) {
      expect(isActionAvailable(action, context), action).toBe(false)
    }
  })

  it('allows everything when nothing is open', () => {
    for (const { action } of SHORTCUTS) {
      expect(isActionAvailable(action, OPEN), action).toBe(true)
    }
  })

  // New todo carries its own list picker (issue #15), so it works from
  // Today and Summary too — but it still needs somewhere to put the todo.
  it('withholds New todo when there is no list to add to', () => {
    const noLists = { ...OPEN, canAddTodo: false }
    expect(isActionAvailable('new-todo', noLists)).toBe(false)
    // Everything else is unaffected: New list is exactly what you want in
    // that state, and navigating to a view needs no list at all.
    expect(isActionAvailable('new-list', noLists)).toBe(true)
    expect(isActionAvailable('go-today', noLists)).toBe(true)
  })
})

// A shortcut must never eat a keystroke meant for a field.
describe('isTextEntry', () => {
  it('recognises the places text goes', () => {
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
      expect(isTextEntry({ tagName }), tagName).toBe(true)
    }
    expect(isTextEntry({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })

  it('leaves ordinary elements alone', () => {
    expect(isTextEntry({ tagName: 'BUTTON' })).toBe(false)
    expect(isTextEntry({ tagName: 'DIV', isContentEditable: false })).toBe(
      false,
    )
    expect(isTextEntry(null)).toBe(false)
  })
})
