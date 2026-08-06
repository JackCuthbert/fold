import { Tooltip } from '@base-ui/react/tooltip'
import type { ReactNode } from 'react'
import { cx } from '../../styles/cx'
import styles from './icon-button.module.css'

/**
 * A button whose label is an icon, named by a tooltip.
 *
 * **A tooltip, not a popover** — the opposite call to `InfoBadge`, and for
 * the reason given there: a tooltip's content is an accessible *name* for
 * its trigger. That is exactly what this is. `InfoBadge` holds a paragraph
 * the user is meant to read, which needs to be focusable and escapable, so
 * it uses a popover instead. Naming a control is the case tooltips are
 * actually for (docs/specs/ui.md — controls & touch targets).
 *
 * The name is *also* on the button as `aria-label`, not only in the
 * tooltip: hover doesn't exist on touch, and assistive tech should never
 * depend on a hover-triggered element to know what a control does.
 *
 * *(added 2026-08-04.)*
 */
interface IconButtonProps {
  /** The control's name — shown on hover/focus and used as its label. */
  label: string
  icon: ReactNode
  onClick: () => void
  /**
   * Extra class for the button, e.g. a role from button.module.css.
   * Explicitly allows `undefined` because a CSS Module lookup is
   * `string | undefined` under `exactOptionalPropertyTypes`.
   */
  className?: string | undefined
  disabled?: boolean
}

export function IconButton(props: IconButtonProps) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        // `render` rather than nesting a <button>: Tooltip.Trigger renders
        // its own element, and a button inside a button is invalid.
        render={
          <button
            type="button"
            aria-label={props.label}
            onClick={props.onClick}
            {...(props.disabled === undefined
              ? {}
              : { disabled: props.disabled })}
          />
        }
        className={cx(styles['button'], props.className)}
      >
        <span aria-hidden="true" className={styles['glyph']}>
          {props.icon}
        </span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={6} className={styles['positioner']}>
          <Tooltip.Popup className={cx(styles['popup'])}>
            {props.label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
