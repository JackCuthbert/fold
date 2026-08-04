import { describe, expect, it } from 'vitest'
import {
  isActionAvailable,
  isTextEntry,
  matchShortcut,
  SHORTCUTS,
  type ShortcutContext,
} from '../src/shortcuts'

const press = (
  key: string,
  mods: { meta?: boolean; ctrl?: boolean; shift?: boolean } = {},
) => ({
  key,
  metaKey: mods.meta ?? false,
  ctrlKey: mods.ctrl ?? false,
  shiftKey: mods.shift ?? false,
})

const OPEN: ShortcutContext = { dialogOpen: false, canAddTodo: true }

describe('matchShortcut', () => {
  it('matches the platform modifier, not either one', () => {
    expect(matchShortcut(press('k', { meta: true }), true)).toBe('new-todo')
    expect(matchShortcut(press('k', { ctrl: true }), false)).toBe('new-todo')
  })

  // Accepting either modifier everywhere would quietly take over chords
  // the other platform reserves for itself.
  it('ignores the other platform’s modifier', () => {
    expect(matchShortcut(press('k', { ctrl: true }), true)).toBeNull()
    expect(matchShortcut(press('k', { meta: true }), false)).toBeNull()
  })

  it('needs a modifier at all', () => {
    expect(matchShortcut(press('k'), true)).toBeNull()
  })

  // Shift has to be matched exactly rather than ignored, or Cmd+Shift+K
  // would also open the new-todo form.
  it('matches shift exactly', () => {
    expect(matchShortcut(press('n', { meta: true, shift: true }), true)).toBe(
      'new-list',
    )
    // Cmd+N without shift is unbound — the browser reserves it, which is
    // why New todo moved to K.
    expect(matchShortcut(press('n', { meta: true }), true)).toBeNull()
    expect(
      matchShortcut(press('k', { meta: true, shift: true }), true),
    ).toBeNull()
  })

  it('matches regardless of the key’s reported case', () => {
    expect(matchShortcut(press('N', { meta: true, shift: true }), true)).toBe(
      'new-list',
    )
    expect(matchShortcut(press('K', { meta: true }), true)).toBe('new-todo')
  })

  it('does not claim keys it has no binding for', () => {
    expect(matchShortcut(press('p', { meta: true }), true)).toBeNull()
    // Reserved for search, which does not exist yet (issue #6). Until it
    // does, the browser's own find must keep working.
    expect(matchShortcut(press('f', { meta: true }), true)).toBeNull()
  })
})

describe('isActionAvailable', () => {
  // The rule settled on issue #5: a shortcut stands down when something is
  // already open rather than stacking a second dialog on top.
  it('stands down while any dialog is open', () => {
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
  // With no lists at all the picker would have nothing to offer.
  it('withholds New todo when there is no list to add to', () => {
    const noLists = { ...OPEN, canAddTodo: false }
    expect(isActionAvailable('new-todo', noLists)).toBe(false)
    // New list is exactly what you want in that state.
    expect(isActionAvailable('new-list', noLists)).toBe(true)
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
