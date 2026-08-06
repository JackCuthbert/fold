import { MdOutlineKeyboardControlKey } from 'react-icons/md'
import { shortcutLetter, type Shortcut } from '../shortcuts/shortcuts'
import { cx } from '../../styles/cx'
import styles from './shortcut-keys.module.css'

/**
 * A chord, drawn as mini keycaps.
 *
 * **Deliberately `react-icons/md`, not the `lu` set used everywhere else**
 * (CLAUDE.md — icons come from a single collection). Material is the only
 * set here that ships the actual modifier keycaps, ⌘ and ⌃, as *glyphs*.
 * The alternative was typing the Unicode characters, which is what this
 * replaced: they render at whatever weight the body font decides, and at
 * the size a shortcut hint wants they were illegible.
 *
 * The exception is scoped to this one file — nothing else imports from
 * `md`, and the single-set rule stands for every other icon.
 * *(added 2026-08-04.)*
 *
 * One component, so the help modal and the New todo button cannot drift —
 * the same reason the map itself lives in one constant
 * (docs/specs/ui.md — keyboard shortcuts).
 */
export function ShortcutKeys(props: {
  shortcut: Shortcut
  /**
   * True when the chord sits on a filled (accent) surface rather than on
   * paper — the caps then take their colour from the button instead of
   * the page. See `.onFilled`.
   */
  onFilled?: boolean
}) {
  // Sized in `em` throughout, so the caps track whatever the surrounding
  // text is set at: one component serves the help list and the nav button
  // without either passing a size.
  const glyph = '1em'

  return (
    <span className={cx(styles['keys'], props.onFilled && styles['onFilled'])}>
      {props.shortcut.primary && (
        <kbd className={styles['cap']}>
          <MdOutlineKeyboardControlKey aria-hidden="true" size={glyph} />
        </kbd>
      )}
      {props.shortcut.shift && (
        <kbd className={cx(styles['cap'], styles['wide'])}>Shift</kbd>
      )}
      <kbd className={styles['cap']}>{shortcutLetter(props.shortcut)}</kbd>
    </span>
  )
}
