import { Select } from '@base-ui/react/select'
import { LuCat, LuChevronDown, LuGhost, LuSunrise } from 'react-icons/lu'
import type { IconType } from 'react-icons'
import { cx } from '../../styles/cx'
import {
  PALETTE_GROUPS,
  PALETTE_ICONS,
  PALETTE_LABELS,
  paletteSchema,
} from '../theme'

const ICONS: Record<'cat' | 'ghost' | 'sunrise', IconType> = {
  cat: LuCat,
  ghost: LuGhost,
  sunrise: LuSunrise,
}
import type { Palette } from '../theme'
import { useTheme } from '../use-theme'
import styles from './palette-select.module.css'

const OPTIONS = paletteSchema.options.map((value) => ({
  value,
  label: PALETTE_LABELS[value],
}))

/**
 * The login screen's palette picker — a named dropdown.
 *
 * docs/specs/themes.md. The theme is browser-local, so it is settable
 * before there is an account: someone who wants true black at night should
 * not have to sign in first to get it.
 *
 * **Named, not swatched.** Settings shows swatches because it has the room
 * to show what each palette *is*; here there is room for one control, and a
 * row of unlabelled dots was tried first — it could show the colours but
 * never say "OLED" or "Catppuccin", which are chosen by name rather than by
 * appearance. A dropdown says both: the label names it, and each item
 * carries its swatch. *(changed 2026-08-10.)*
 *
 * Base UI's Select supplies the trigger/listbox wiring, keyboard handling
 * and focus management (docs/specs/ui.md — prefer Base UI over
 * hand-rolling), the same as the priority picker in the detail panel.
 */
export function PaletteSelect() {
  const { theme, setPalette } = useTheme()

  return (
    <Select.Root
      items={OPTIONS}
      value={theme.palette}
      // Base UI can emit null (a clearable select); this one is not
      // clearable, so ignore it rather than widening the stored theme to
      // admit a palette that has no stylesheet.
      onValueChange={(value: Palette | null) => {
        if (value !== null) setPalette(value)
      }}
    >
      <Select.Trigger className={styles['trigger']} aria-label="Colour theme">
        <Swatch palette={theme.palette} />
        <Select.Value />
        <Select.Icon className={styles['icon']}>
          <LuChevronDown aria-hidden="true" size={13} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        {/* `alignItemWithTrigger={false}` so the list opens above the
            trigger rather than covering it — this control sits at the foot
            of the form, so downward is off-screen. */}
        <Select.Positioner
          className={styles['positioner']}
          side="top"
          sideOffset={4}
          alignItemWithTrigger={false}
        >
          <Select.Popup className={styles['popup']}>
            {PALETTE_GROUPS.map((group) => (
              <Select.Group key={group.label}>
                <Select.GroupLabel className={styles['groupLabel']}>
                  {group.label}
                </Select.GroupLabel>
                {group.palettes.map((palette) => {
                  // Only the palettes named after something carry a glyph
                  // (theme.ts — PALETTE_ICONS).
                  const name = PALETTE_ICONS[palette]
                  const Icon = name ? ICONS[name] : null
                  return (
                    <Select.Item
                      key={palette}
                      value={palette}
                      className={styles['item']}
                    >
                      <Swatch palette={palette} />
                      <Select.ItemText>
                        {PALETTE_LABELS[palette]}
                      </Select.ItemText>
                      {Icon !== null && (
                        <Icon
                          className={styles['mark']}
                          size={13}
                          aria-hidden="true"
                        />
                      )}
                    </Select.Item>
                  )
                })}
              </Select.Group>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}

interface SwatchProps {
  palette: Palette
}

/**
 * A palette's colours in a dot: its own paper, ringed in its own accent.
 *
 * OLED shows its dark ramp because it *has* no light one — it is black in
 * both modes (styles/palettes.css), which is the whole point of it.
 */
function Swatch(props: SwatchProps) {
  return (
    <span
      className={cx(styles['swatch'])}
      data-palette={props.palette}
      data-theme={props.palette === 'oled' ? 'dark' : 'light'}
      aria-hidden="true"
    />
  )
}
