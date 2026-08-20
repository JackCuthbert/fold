import { describe, expect, it } from 'vitest'
import {
  isActionAvailable,
  isTextEntry,
  matchShortcut,
  shortcutLetter,
  SHORTCUTS,
  viewIndexOf,
  type ShortcutContext,
} from './shortcuts'
import { DERIVED_VIEWS } from '../../todos/lib/today'

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
    // New todo is the one modifier-less binding (shortcuts.ts), so it
    // must match a bare N *and not* a modified one — Ctrl+N belongs to the
    // browser, and to the `#` autocomplete inside quick add.
    expect(matchShortcut(press('KeyN'))).toBe('new-todo')
    expect(matchShortcut(press('KeyN', { ctrl: true }))).toBeNull()
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
      'go-view:1',
    )
    expect(matchShortcut(press('Digit2', { ctrl: true, shift: true }))).toBe(
      'go-view:2',
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
      SHORTCUTS.map((s) => [s.command, shortcutLetter(s)]),
    )
    expect(printed['new-todo']).toBe('N')
    expect(printed['new-list']).toBe('N')
    expect(printed['help']).toBe('/')
  })

  // The view caps are asserted as a *rule* rather than a list. Spelling
  // out every view meant adding one broke this test for no reason —
  // shape, not behaviour (CLAUDE.md). What matters is that the nth view's
  // cap prints n, whichever views exist. *(changed 2026-08-05: was a
  // literal map of two views.)*
  it('prints the view number on each view’s cap', () => {
    const views = SHORTCUTS.filter((s) => s.command.startsWith('go-view:'))
    expect(views.length).toBe(Math.min(DERIVED_VIEWS.length, 9))
    for (const [index, shortcut] of views.entries()) {
      expect(shortcutLetter(shortcut)).toBe(String(index + 1))
      expect(shortcut.command).toBe(`go-view:${index + 1}`)
    }
  })
})

describe('isActionAvailable', () => {
  // The rule settled on issue #5: a shortcut stands down when a modal is
  // already open rather than stacking a second one on top.
  it('stands down while a dialog is open', () => {
    const context = { ...OPEN, dialogOpen: true }
    for (const { command } of SHORTCUTS) {
      expect(isActionAvailable(command, context), command).toBe(false)
    }
  })

  it('allows everything when nothing is open', () => {
    for (const { command } of SHORTCUTS) {
      expect(isActionAvailable(command, OPEN), command).toBe(true)
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
    expect(isActionAvailable('go-view:1', noLists)).toBe(true)
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

// docs/specs/ui.md — keyboard shortcuts: the nth derived view gets
// Ctrl+Shift+n, generated from DERIVED_VIEWS so adding a view needs no
// change to the map. Real lists deliberately get nothing — a positional
// chord would change meaning whenever a list is created or deleted.
describe('derived-view chords', () => {
  it('binds one chord per view, numbered in nav order', () => {
    const viewChords = SHORTCUTS.filter((s) => viewIndexOf(s.command) !== null)
    expect(viewChords).toHaveLength(DERIVED_VIEWS.length)
    expect(viewChords.map((s) => s.code)).toEqual(
      DERIVED_VIEWS.map((_, i) => `Digit${i + 1}`),
    )
  })

  it('resolves an action back to its 1-based index', () => {
    expect(viewIndexOf('go-view:1')).toBe(1)
    expect(viewIndexOf('go-view:2')).toBe(2)
    // Not a view action at all.
    expect(viewIndexOf('new-todo')).toBeNull()
  })

  // Every view chord must be Ctrl+Shift — plain Ctrl+digit is taken by
  // the OS and the browser, so it would never arrive.
  it('always carries both modifiers', () => {
    for (const chord of SHORTCUTS.filter(
      (s) => viewIndexOf(s.command) !== null,
    )) {
      expect(chord.primary, chord.command).toBe(true)
      expect(chord.shift, chord.command).toBe(true)
    }
  })
})
