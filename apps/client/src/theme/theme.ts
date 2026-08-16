import { z } from 'zod'

/**
 * The app's themeable surface: a colour palette and a light/dark mode.
 *
 * docs/specs/themes.md.
 *
 * **Browser-local, never synced.** There is no CalDAV property for "which
 * palette do I like", and inventing one would break the rule the whole app
 * is built on — that another client pointed at the same server sees
 * ordinary lists and todos (docs/specs/list-kinds.md — entirely
 * app-level). A theme is a fact about *this browser*, so it lives in
 * localStorage beside the mute flag and the list filter, and a second
 * device is free to disagree.
 *
 * *(added 2026-08-10.)*
 */

/** A palette redefines the neutral ramp and the accent, nothing else. */
export const paletteSchema = z.enum([
  'paper',
  'parchment',
  'stone',
  'oled',
  'catppuccin',
  'dracula',
  'ayu',
])
export type Palette = z.infer<typeof paletteSchema>

/**
 * `system` follows the OS rather than pinning a mode, and is the default —
 * a todo app that ignores the platform's own dark-mode switch is the thing
 * people notice first.
 */
export const modeSchema = z.enum(['system', 'light', 'dark'])
export type Mode = z.infer<typeof modeSchema>

/**
 * The body typeface.
 *
 * Two only, both self-hosted and variable (styles/fonts.css). Not a free
 * choice of any installed font: the app distributes its faces rather than
 * assuming them, and the meta pills' geometry was measured against these
 * two — a third face chosen by the user would not have been checked.
 */
export const typefaceSchema = z.enum(['serif', 'sans'])
export type Typeface = z.infer<typeof typefaceSchema>

export const themeSchema = z.object({
  palette: paletteSchema,
  mode: modeSchema,
  // Defaulted rather than required, so a theme stored before typefaces
  // existed still parses instead of falling back to the whole default and
  // silently discarding the user's palette. *(added 2026-08-10.)*
  typeface: typefaceSchema.default('serif'),
})
export type Theme = z.infer<typeof themeSchema>

/**
 * Paper: lighter and cooler than the original Parchment, and the default.
 * *(changed 2026-08-10: was Parchment, the app's original off-white.)*
 */
export const DEFAULT_THEME: Theme = {
  palette: 'paper',
  mode: 'system',
  typeface: 'serif',
}

export const PALETTE_LABELS: Record<Palette, string> = {
  paper: 'Paper',
  parchment: 'Parchment',
  stone: 'Stone',
  oled: 'OLED',
  catppuccin: 'Catppuccin',
  dracula: 'Dracula',
  ayu: 'Ayu',
}

/**
 * A glyph for the palettes named after something rather than described by
 * their colour — the way each is recognised elsewhere. The app's own three
 * carry none: a full set would be decoration, and "Paper" needs no picture.
 *
 * Names only, resolved to components by the picker, so this module stays
 * free of JSX and can be imported by tests.
 *
 * *(added 2026-08-10.)*
 */
export const PALETTE_ICONS: Partial<
  Record<Palette, 'cat' | 'ghost' | 'sunrise'>
> = {
  catppuccin: 'cat',
  dracula: 'ghost',
  ayu: 'sunrise',
}

export const PALETTE_NOTES: Record<Palette, string> = {
  paper: 'Lighter and cooler, almost white',
  parchment: 'Warm off-white, brown accent',
  stone: 'Greyscale, with a blue-green cast',
  oled: 'Always true black, light or dark',
  catppuccin: 'Soothing pastel — Latte and Mocha',
  dracula: 'The dark one, in purple and pink',
  ayu: 'Very plain, with a burnt orange accent',
}

/**
 * Palettes in two families.
 *
 * **Original** are Fold's own: three neutral grounds drawn from the same
 * paper metaphor, differing only in temperature. **Extras** are chosen for
 * a specific reason rather than a mood — a screen technology, a palette you
 * already use elsewhere — so they are grouped apart rather than listed as
 * if they were more shades of paper.
 *
 * "Borrowed" was tried and rejected: OLED is not borrowed from anywhere,
 * and the name left nowhere for user-defined themes to go. "Extras" is
 * accurate about all three cases. *(added 2026-08-10.)*
 */
export const PALETTE_GROUPS: {
  label: string
  palettes: readonly Palette[]
}[] = [
  { label: 'Original', palettes: ['paper', 'parchment', 'stone'] },
  {
    // Alphabetical: unlike Original, whose order is a progression from
    // warm to cool, these have no relationship to each other — so the only
    // honest order is the one a reader can predict.
    label: 'Extras',
    palettes: ['ayu', 'catppuccin', 'dracula', 'oled'],
  },
]

/**
 * What each face is, for the picker.
 *
 * `stack` is what goes on `--serif`, and is the same value tokens.css sets
 * by default — a picker that shipped its own font stack would drift from
 * the stylesheet the moment either changed.
 */
export const TYPEFACES: Record<
  Typeface,
  { name: string; note: string; character: string; stack: string }
> = {
  serif: {
    name: 'Lora',
    note: 'Serif · the default',
    // What choosing it actually gets you, rather than a category name.
    // Both are true of the faces as set here, at the app's own sizes.
    character: 'Warmer and calmer to read at length. Takes more room.',
    stack: 'Lora, Georgia, Cambria, serif',
  },
  sans: {
    name: 'Cabin',
    note: 'Sans-serif',
    character: 'Plainer and more compact. Sharper on small screens.',
    stack: 'Cabin, ui-sans-serif, system-ui, sans-serif',
  },
}

export const MODE_LABELS: Record<Mode, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
}

/** The localStorage key. Exported so the hook and the store agree. */
export const THEME_KEY = 'fold-theme'

/**
 * Read the stored theme, falling back to the default.
 *
 * Validated rather than cast: localStorage is a trust boundary like any
 * other (CLAUDE.md — validate at every trust boundary). A hand-edited or
 * stale value must not put the app into a palette that has no stylesheet,
 * which would render it unstyled rather than merely wrong.
 */
export function loadTheme(raw: string | null): Theme {
  if (raw === null) return DEFAULT_THEME
  try {
    const parsed: unknown = JSON.parse(raw)
    const result = themeSchema.safeParse(parsed)
    return result.success ? result.data : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

export const storeTheme = (theme: Theme): string => JSON.stringify(theme)

/**
 * The mode actually applied, once `system` has been resolved.
 *
 * Kept separate from the *preference* so the two are never confused: the
 * stored value can be `system` indefinitely, while what the page renders is
 * only ever light or dark.
 */
export function resolveMode(
  mode: Mode,
  prefersDark: boolean,
): 'light' | 'dark' {
  if (mode === 'system') return prefersDark ? 'dark' : 'light'
  return mode
}

/**
 * Apply a theme to the document.
 *
 * Two attributes on `<html>`, which is the whole mechanism — the palettes
 * are plain CSS selected by `[data-palette]` and `[data-theme]`
 * (styles/palettes.css), so switching costs one attribute write and no
 * re-render of the tree.
 */
export function applyTheme(
  // The narrow shape actually used, rather than HTMLElement: it is all the
  // function touches, and it lets the test pass a plain object instead of
  // casting one (theme.test.ts). `DOMStringMap` indexes to
  // `string | undefined`, so the parameter has to admit that to accept a
  // real element.
  root: {
    dataset: Record<string, string | undefined>
    style?: { setProperty: (name: string, value: string) => void }
  },
  theme: Theme,
  prefersDark: boolean,
): void {
  root.dataset['palette'] = theme.palette
  root.dataset['theme'] = resolveMode(theme.mode, prefersDark)
  // The typeface is one custom property rather than an attribute: every
  // component already consumes `--serif`, so nothing else has to know the
  // choice exists.
  root.style?.setProperty('--serif', TYPEFACES[theme.typeface].stack)
}
