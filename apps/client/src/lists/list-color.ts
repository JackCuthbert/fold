/**
 * The contrast guard — docs/specs/lists.md (colours).
 *
 * A list's colour is arbitrary: it can come from Apple Reminders, from a
 * hex field, or from a colour wheel. The **dot** always shows it as-is.
 * The **selection marker** is different — it has a job to do, and a colour
 * too close to the paper would make a selected row read as unselected.
 *
 * So the marker falls back to `--accent` when the list's colour doesn't
 * contrast enough with the current theme's paper. This is the only place
 * the app second-guesses a user's colour, and it never changes what is
 * stored — purely presentational.
 */

/**
 * Paper luminance per theme — --paper in styles/tokens.css (light
 * #faf9f6, dark #17150f). These are the WCAG relative luminance of those
 * exact hex values, computed with `luminance` below — not eyeballed.
 */
const PAPER_LUMINANCE = {
  light: 0.9473, // #faf9f6
  dark: 0.0075, // #17150f
} as const

export type Theme = keyof typeof PAPER_LUMINANCE

/**
 * Minimum luminance gap from the paper. Chosen so a marker reads as a
 * deliberate mark rather than a smudge; well below a text-contrast
 * threshold, because this is a 4px bar, not a glyph.
 */
const MIN_DELTA = 0.28

const channel = (hex: string, at: number): number => {
  const value = Number.parseInt(hex.slice(at, at + 2), 16) / 255
  // sRGB → linear, per WCAG relative luminance.
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance of a `#RRGGBB` colour, 0..1. */
export function luminance(color: string): number {
  return (
    0.2126 * channel(color, 1) +
    0.7152 * channel(color, 3) +
    0.0722 * channel(color, 5)
  )
}

/**
 * What the selected row's left marker should be painted: the list's own
 * colour, or the accent token when that colour would disappear against the
 * paper. Returns a CSS value, ready to drop into a style property.
 */
export function markerColor(color: string | undefined, theme: Theme): string {
  if (!color) return 'var(--accent)'
  const delta = Math.abs(luminance(color) - PAPER_LUMINANCE[theme])
  return delta >= MIN_DELTA ? color : 'var(--accent)'
}
