import { describe, expect, it } from 'vitest'
import { markerColor } from '../src/lists/list-color'

// docs/specs/lists.md — the contrast guard. The dot always carries the
// list's colour; the *marker* falls back to --accent when that colour is
// too close to the paper to read as a selection state.
describe('markerColor', () => {
  it('uses the list colour when it contrasts with the paper', () => {
    expect(markerColor('#1D9BF6', 'light')).toBe('#1D9BF6')
    expect(markerColor('#E8503A', 'light')).toBe('#E8503A')
  })

  it('falls back to the accent when a colour is too pale on light paper', () => {
    // Near-white on #faf9f6 paper: a marker nobody could see.
    expect(markerColor('#FFFEF8', 'light')).toBe('var(--accent)')
    expect(markerColor('#F5F4F0', 'light')).toBe('var(--accent)')
  })

  it('falls back when a colour is too dark on dark paper', () => {
    // Near-black on #17150f paper.
    expect(markerColor('#111111', 'dark')).toBe('var(--accent)')
  })

  it('accepts on dark paper what it rejects on light, and vice versa', () => {
    // A pale yellow is invisible on paper but fine on a dark page.
    expect(markerColor('#FFFEF8', 'light')).toBe('var(--accent)')
    expect(markerColor('#FFFEF8', 'dark')).toBe('#FFFEF8')
  })

  it('falls back when there is no colour at all', () => {
    expect(markerColor(undefined, 'light')).toBe('var(--accent)')
  })
})
