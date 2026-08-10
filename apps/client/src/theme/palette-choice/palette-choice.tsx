import { LuCat, LuGhost, LuSunrise } from 'react-icons/lu'
import type { IconType } from 'react-icons'
import type { Palette } from '../theme'
import { PALETTE_ICONS, PALETTE_LABELS, PALETTE_NOTES } from '../theme'

const ICONS: Record<'cat' | 'ghost' | 'sunrise', IconType> = {
  cat: LuCat,
  ghost: LuGhost,
  sunrise: LuSunrise,
}
import styles from './palette-choice.module.css'

export interface PaletteChoiceProps {
  palette: Palette
  selected: boolean
  onSelect: (palette: Palette) => void
}

/**
 * One palette, as a swatch you can see rather than a name you have to
 * imagine (docs/specs/themes.md).
 *
 * The swatch paints the palette's own paper, ink and accent — three
 * stacked bands, in the order the eye meets them on a real page. A radio
 * list of the words "Parchment / Paper / Stone" would make the user apply
 * each one to find out what it is; showing the colours means the choice is
 * made before the click.
 *
 * The colours come from `[data-palette]` on the swatch itself, so it reads
 * the same stylesheet the app does (styles/palettes.css) rather than
 * repeating hex values that would drift.
 *
 * *(added 2026-08-10.)*
 */
export function PaletteChoice(props: PaletteChoiceProps) {
  const icon = PALETTE_ICONS[props.palette]
  const Icon = icon ? ICONS[icon] : null
  return (
    <button
      type="button"
      className={styles['choice']}
      aria-pressed={props.selected}
      onClick={() => props.onSelect(props.palette)}
    >
      {/* Its own palette. Light mode for most, since the swatch answers
          "what is this palette" and the mode control beside it answers
          "light or dark" — a swatch that flipped would conflate the two.

          OLED is the exception: its light variant is borrowed from Stone,
          so a light swatch made the two indistinguishable and hid the one
          thing OLED is for. It shows its dark ramp instead, which is the
          honest answer to what choosing it gets you.
          *(added 2026-08-10.)* */}
      <span
        className={styles['swatch']}
        data-palette={props.palette}
        data-theme={props.palette === 'oled' ? 'dark' : 'light'}
        aria-hidden="true"
      >
        <span className={styles['swatchPaper']} />
        <span className={styles['swatchInk']} />
        <span className={styles['swatchAccent']} />
      </span>
      <span className={styles['text']}>
        <span className={styles['name']}>
          {PALETTE_LABELS[props.palette]}
          {/* Only the palettes named after something carry one — how each
              is recognised elsewhere (theme.ts — PALETTE_ICONS). */}
          {Icon !== null && (
            <Icon className={styles['mark']} size={14} aria-hidden="true" />
          )}
        </span>
        <span className={styles['note']}>{PALETTE_NOTES[props.palette]}</span>
      </span>
    </button>
  )
}
