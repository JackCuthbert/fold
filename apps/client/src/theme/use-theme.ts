import { useSyncExternalStore } from 'react'
import {
  applyTheme,
  loadTheme,
  storeTheme,
  THEME_KEY,
  type Mode,
  type Palette,
  type Theme,
  type Typeface,
} from './theme'

/**
 * The current theme, and the two setters that change it.
 *
 * docs/specs/themes.md. Modelled on `useSound` (sound/use-sound.ts): a
 * `useSyncExternalStore` over localStorage rather than a context, because
 * the value is read in one place and written in one place — a provider
 * would be indirection with nothing on the other side of it.
 *
 * *(added 2026-08-10.)*
 */

const listeners = new Set<() => void>()

const media = (): MediaQueryList | null =>
  typeof matchMedia === 'function'
    ? matchMedia('(prefers-color-scheme: dark)')
    : null

/**
 * Cached so `useSyncExternalStore` gets a stable snapshot — parsing on
 * every call returns a fresh object each time, which React reads as a
 * changed store and re-renders forever.
 */
let cached: { raw: string | null; theme: Theme } | null = null

function snapshot(): Theme {
  const raw = localStorage.getItem(THEME_KEY)
  if (cached === null || cached.raw !== raw) {
    cached = { raw, theme: loadTheme(raw) }
  }
  return cached.theme
}

const notify = (): void => {
  for (const listener of listeners) listener()
}

/**
 * Put the stored theme on the document, and keep it there.
 *
 * Called once from `main.tsx` before the tree mounts, so the first paint is
 * already in the right palette — applying it from an effect would show a
 * frame of the default first, which is exactly the flash a theme feature
 * exists to avoid.
 *
 * Returns a teardown for the OS-preference listener, which matters only
 * because `mode: 'system'` has to re-resolve when the platform flips.
 */
export function startTheme(): () => void {
  const root = document.documentElement
  const mq = media()
  const paint = (): void => {
    applyTheme(root, snapshot(), mq?.matches ?? false)
  }
  paint()
  listeners.add(paint)
  mq?.addEventListener('change', paint)
  return () => {
    listeners.delete(paint)
    mq?.removeEventListener('change', paint)
  }
}

export interface ThemeControls {
  theme: Theme
  /** The mode actually rendering, once `system` is resolved. */
  resolved: 'light' | 'dark'
  setPalette: (palette: Palette) => void
  setMode: (mode: Mode) => void
  setTypeface: (typeface: Typeface) => void
}

export function useTheme(): ThemeControls {
  const theme = useSyncExternalStore((onChange) => {
    listeners.add(onChange)
    return () => listeners.delete(onChange)
  }, snapshot)

  const prefersDark = media()?.matches ?? false

  const write = (next: Theme): void => {
    localStorage.setItem(THEME_KEY, storeTheme(next))
    notify()
  }

  return {
    theme,
    resolved:
      theme.mode === 'system' ? (prefersDark ? 'dark' : 'light') : theme.mode,
    setPalette: (palette) => write({ ...theme, palette }),
    setMode: (mode) => write({ ...theme, mode }),
    setTypeface: (typeface) => write({ ...theme, typeface }),
  }
}
