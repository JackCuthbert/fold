import { LuPlus, LuTerminal } from 'react-icons/lu'
import { cx } from '../../styles/cx'
import { useOverlays } from '../context/overlays-context'
import styles from './floating-actions.module.css'

/**
 * The two most-used actions, within a thumb's reach on touch
 * (docs/specs/command-palette.md — on touch).
 *
 * **Shown whenever the sidebar is not.** On a phone that is always, since
 * the nav is a drawer; on desktop it is whenever the sidebar is collapsed.
 * The rule is the same in both: these reach what the sidebar holds, so
 * they are redundant while it is on screen and the only route to it when
 * it is not.
 *
 * The arrangement differs, though. Stacked at the trailing edge on touch,
 * where a thumb reaches the bottom-right corner; laid out in a row at the
 * bottom centre on desktop, where there is no thumb and the eye is already
 * at the middle of a list. *(desktop added 2026-08-20.)*
 *
 * Rendered by `MainScreen` rather than inside the pane: it floats over
 * whichever view is showing, and a pane that owned it would have to
 * re-render it per view.
 */
interface FloatingActionsProps {
  /**
   * Whether the desktop sidebar is showing.
   *
   * The buttons exist to reach what the sidebar holds, so they appear
   * exactly when it does not: collapsed on desktop, or a drawer on touch.
   * Passed in rather than read from a context because `MainScreen` already
   * owns the nav's layout state (shell/hooks/use-nav-layout).
   */
  navOpen: boolean
}

export function FloatingActions(props: FloatingActionsProps) {
  const overlays = useOverlays()

  return (
    <div
      className={cx(styles['bar'], !props.navOpen && styles['barStandalone'])}
    >
      {/* The palette second, so the todo button is the one nearest the
          thumb: it is the more frequent of the two by a wide margin.

          Only the primary carries a label: "New todo", the same words
          the nav and the command palette use for this action, so one
          thing is not named three ways across the app. The palette
          reduces to its mark, which keeps the pair from reading as two
          equal choices when one of them is what you came for — and it
          keeps an `aria-label`, because an icon-only button has no name
          without one. */}
      <button
        type="button"
        className={styles['button']}
        onClick={() => overlays.globalAdd.setOpen(true)}
      >
        <LuPlus className={styles['icon']} aria-hidden="true" />
        New todo
      </button>
      <button
        type="button"
        className={cx(
          styles['button'],
          styles['buttonSecondary'],
          styles['buttonIconOnly'],
        )}
        aria-label="Commands"
        onClick={() => overlays.setPaletteOpen(true)}
      >
        {/* A prompt, not `LuCommand`: that icon is the ⌘ glyph, and this
            app binds Ctrl on every platform and refuses `metaKey`
            outright (shortcuts.ts — hasPrimaryModifier). An icon naming
            the one modifier the app does not use would be wrong on a Mac
            and meaningless everywhere else.
            *(changed 2026-08-20, on review.)* */}
        <LuTerminal className={styles['icon']} aria-hidden="true" />
      </button>
    </div>
  )
}
