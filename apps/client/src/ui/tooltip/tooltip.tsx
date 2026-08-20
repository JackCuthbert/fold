import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip'
import type { ReactElement } from 'react'
import styles from './tooltip.module.css'

/**
 * The name of an icon-only control, on hover or focus.
 *
 * **A tooltip is not the control's accessible name.** The trigger still
 * carries its own `aria-label`; this only shows sighted pointer users what
 * a screen reader was already being told. Base UI wires the description
 * relationship, so the two do not double up into "New list New list".
 *
 * **Hover and keyboard focus both open it**, which is the reason to reach
 * for Base UI rather than the `title` attribute: `title` never appears for
 * a keyboard user, waits about a second with no way to tune it, and cannot
 * be styled. It also renders in a portal, so a tooltip on a control inside
 * a scrolling panel is not clipped by it.
 *
 * docs/specs/ui.md — controls.
 */
interface TooltipProps {
  /** The words to show. Short enough not to wrap — a few at most. */
  label: string
  /**
   * The control being labelled. Rendered as the trigger itself rather
   * than wrapped in one, so the tooltip adds no box to the layout — the
   * nav's heading row measures its buttons, and a wrapper would sit
   * between them.
   */
  children: ReactElement
}

export function Tooltip(props: TooltipProps) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={props.children} />
      <BaseTooltip.Portal>
        {/* Above and centred by default. A tooltip below its trigger
            lands on whatever the control sits above — in the nav that is
            the next row down, which is itself a target — and the pointer
            travelling to that row passes through the tooltip. Above is
            also where the eye already is, having just read the icon.
            *(changed 2026-08-20.)* */}
        <BaseTooltip.Positioner side="top" align="center" sideOffset={6}>
          <BaseTooltip.Popup className={styles['popup']}>
            {props.label}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  )
}
