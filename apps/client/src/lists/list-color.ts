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
 * Minimum luminance gap from the paper. Well below a text-contrast
 * threshold, because this is a 4px bar rather than a glyph — it only has
 * to read as a deliberate mark.
 *
 * **This number cannot be tuned against light paper alone.** Luminance is
 * not perceptually uniform, and the two papers sit at opposite ends of the
 * scale (0.947 and 0.008), so the same colour's delta differs by an order
 * of magnitude between themes. Our own palette measures ~0.69–0.80 against
 * light paper but only ~0.14–0.25 against dark: a threshold picked to look
 * generous in light mode silently rejects *every* swatch in dark mode, and
 * the marker would never take a list's colour on a dark page at all.
 *
 * The viable window, measured against the real palette and the colours the
 * tests require to fall back, is 0.044–0.135. This sits mid-window.
 *
 * *(fixed 2026-08-03: was 0.28 — above the window, so dark mode always
 * fell back. Caught by testing the actual palette rather than only the
 * extreme cases.)*
 */
const MIN_DELTA = 0.09

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
