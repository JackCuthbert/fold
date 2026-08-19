import { describe, expect, it } from 'vitest'
import type { QuickAddToken } from './quick-add'
import { tokensChanged } from './editable-caret'

// docs/specs/quick-add.md — what a contenteditable costs. This predicate
// is the whole undo story: rewriting `innerHTML` empties the browser's
// undo stack, so the marks are redrawn only when the token set actually
// changes and left alone for every keystroke that does not move one.
// False here means the DOM is never touched, which is what keeps ⌘Z
// native for ordinary typing.
//
// The caret helpers beside this one are deliberately *not* unit tested:
// what they assert is DOM behaviour, the client has no DOM test
// environment (every test here is a `.ts` over extracted logic), and
// adding one for two functions would be a fourth test arrangement in a
// repo that already has three. They are covered in e2e/tests/quick-add,
// against a real browser.

const token = (
  kind: QuickAddToken['kind'],
  start: number,
  end: number,
): QuickAddToken => ({ kind, start, end })

describe('tokensChanged', () => {
  it('is false for the same tokens, so typing does not redraw', () => {
    const text = 'Clean the gutters tomorrow at 3pm #Chores'
    const before = [token('date', 18, 33), token('list', 34, 41)]
    const after = [token('date', 18, 33), token('list', 34, 41)]
    expect(tokensChanged(before, after, text, text)).toBe(false)
  })

  it('is false for two empty sets', () => {
    expect(tokensChanged([], [], '', '')).toBe(false)
  })

  it('is true when a token appears', () => {
    // Typing the "m" that completes "3pm": this is the one keystroke
    // that costs an undo entry, and it has to redraw to earn it.
    const before = [token('list', 34, 41)]
    const after = [token('date', 18, 33), token('list', 34, 41)]
    const text = 'Clean the gutters tomorrow at 3pm #Chores'
    expect(tokensChanged(before, after, text, text)).toBe(true)
  })

  it('is true when a token disappears', () => {
    const text = 'Clean the gutters tomorrow at 3pm #Chores'
    const before = [token('date', 18, 33), token('list', 34, 41)]
    const after = [token('date', 18, 33)]
    expect(tokensChanged(before, after, text, text)).toBe(true)
  })

  it('is false when a token only slides along the line', () => {
    // Typing a character *before* a token shifts its offsets without
    // changing which words are marked. Found in the browser 2026-08-19:
    // comparing raw offsets made this the common case rather than the
    // rare one — every keystroke in the prose before a token forced a
    // redraw, and with it lost that keystroke's undo entry, which is
    // exactly what this predicate exists to prevent. What matters is
    // which text is marked, not where it sits.
    const text = 'Clean the gutters tomorrow at 3pm'
    const shifted = 'Clean the Zgutters tomorrow at 3pm'
    expect(
      tokensChanged(
        [token('date', 18, 33)],
        [token('date', 19, 34)],
        text,
        shifted,
      ),
    ).toBe(false)
  })

  it('is true when a token moves onto different words', () => {
    const before = [token('date', 0, 8)]
    const after = [token('date', 9, 17)]
    expect(
      tokensChanged(before, after, 'tomorrow p1 today', 'tomorrow today p1'),
    ).toBe(true)
  })

  it('is true when a token grows', () => {
    // "tomorrow" becoming "tomorrow at 3pm" — same start, same kind, and
    // the mark has to stretch.
    const text = 'Clean the gutters tomorrow at 3pm'
    const before = [token('date', 18, 26)]
    const after = [token('date', 18, 33)]
    expect(tokensChanged(before, after, text, text)).toBe(true)
  })

  it('is true when only the kind differs', () => {
    // Same span, different meaning. Nothing in the app produces this
    // today, but the mark is drawn from the token, so a set that differs
    // only by kind is still a set that has changed.
    const before = [token('date', 0, 2)]
    const after = [token('priority', 0, 2)]
    expect(tokensChanged(before, after, 'p1 milk', 'p1 milk')).toBe(true)
  })
})
