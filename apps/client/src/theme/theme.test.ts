import { describe, expect, it } from 'vitest'
import {
  applyTheme,
  DEFAULT_THEME,
  loadTheme,
  resolveMode,
  storeTheme,
} from './theme'

// docs/specs/themes.md
describe('loadTheme', () => {
  it('round-trips a stored theme', () => {
    const theme = { palette: 'stone', mode: 'dark', typeface: 'sans' } as const
    expect(loadTheme(storeTheme(theme))).toEqual(theme)
  })

  it('falls back when nothing is stored', () => {
    expect(loadTheme(null)).toEqual(DEFAULT_THEME)
  })

  it('falls back on a palette that no longer exists', () => {
    // The failure this guards: a hand-edited or stale value naming a
    // palette with no stylesheet renders the app unstyled, which is worse
    // than rendering it in the wrong colours.
    expect(loadTheme('{"palette":"midnight","mode":"dark"}')).toEqual(
      DEFAULT_THEME,
    )
  })

  it('falls back on malformed JSON', () => {
    expect(loadTheme('{not json')).toEqual(DEFAULT_THEME)
  })

  it('keeps a theme stored before typefaces existed', () => {
    // The upgrade path: `typeface` is defaulted rather than required, so an
    // older stored value keeps its palette instead of being discarded
    // wholesale and silently resetting the user's choice.
    expect(loadTheme('{"palette":"stone","mode":"dark"}')).toEqual({
      palette: 'stone',
      mode: 'dark',
      typeface: 'serif',
    })
  })
})

describe('resolveMode', () => {
  it('follows the platform when set to system', () => {
    expect(resolveMode('system', true)).toBe('dark')
    expect(resolveMode('system', false)).toBe('light')
  })

  it('ignores the platform when pinned', () => {
    // The whole point of an explicit choice: an OS in dark mode must not
    // override a user who asked for light.
    expect(resolveMode('light', true)).toBe('light')
    expect(resolveMode('dark', false)).toBe('dark')
  })
})

// A stub rather than a DOM: this suite runs without one, and `applyTheme`
// only ever touches `dataset` — so the stub exercises exactly what it does
// without dragging jsdom in for two property writes. Typed as the narrow
// shape the function needs rather than cast to HTMLElement, so the test
// cannot mask a signature that grew.
const stub = (): {
  dataset: Record<string, string | undefined>
  style: { setProperty: (name: string, value: string) => void }
  props: Record<string, string>
} => {
  const props: Record<string, string> = {}
  return {
    dataset: {},
    style: {
      setProperty: (name, value) => {
        props[name] = value
      },
    },
    props,
  }
}

describe('applyTheme', () => {
  it('writes both attributes, with system resolved', () => {
    const root = stub()
    applyTheme(
      root,
      { palette: 'stone', mode: 'system', typeface: 'serif' },
      true,
    )

    expect(root.dataset['palette']).toBe('stone')
    // Not 'system' — the stylesheet only knows light and dark.
    expect(root.dataset['theme']).toBe('dark')
  })

  it('sets the chosen typeface on --serif', () => {
    const root = stub()
    applyTheme(
      root,
      { palette: 'paper', mode: 'light', typeface: 'sans' },
      false,
    )

    // Cabin, not the serif default — the whole point of the choice.
    expect(root.props['--serif']).toContain('Cabin')
  })

  it('pins the mode when the user chose one', () => {
    const root = stub()
    applyTheme(
      root,
      { palette: 'paper', mode: 'light', typeface: 'serif' },
      true,
    )

    expect(root.dataset['theme']).toBe('light')
  })
})
