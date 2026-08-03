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

  // The case the extremes above miss. Luminance is not perceptually
  // uniform and the two papers sit at opposite ends of the scale, so a
  // threshold tuned against near-white paper can reject *every* real
  // swatch on a dark page — the marker would then never take a list's
  // colour in dark mode, and no test above would notice.
  //
  // These are the eight palette swatches from styles/tokens.css. They must
  // survive the guard in BOTH themes; that is the whole point of offering
  // them as the default choices.
  //
  // *(added 2026-08-03 with the MIN_DELTA fix: the guard was rejecting all
  // eight on dark paper.)*
  describe('the shipped palette survives the guard in both themes', () => {
    const PALETTE = [
      '#A8564A',
      '#B3703A',
      '#A8863C',
      '#5D7F52',
      '#4A7F78',
      '#4A6F96',
      '#7A5F8F',
      '#9C5C72',
    ]

    it.each(PALETTE)('%s keeps its colour on light paper', (color) => {
      expect(markerColor(color, 'light')).toBe(color)
    })

    it.each(PALETTE)('%s keeps its colour on dark paper', (color) => {
      expect(markerColor(color, 'dark')).toBe(color)
    })
  })
})
