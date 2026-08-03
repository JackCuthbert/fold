import { Popover } from '@base-ui/react/popover'
import type { ReactNode } from 'react'
import { LuInfo } from 'react-icons/lu'
import styles from './extension-badge.module.css'

/**
 * Marks a feature that relies on a CalDAV **extension** rather than RFC
 * 4791 — docs/specs/lists.md (colours and ordering).
 *
 * Generic on purpose: it takes its own text, so any future extension-backed
 * feature can reuse it rather than growing a second version.
 *
 * **A popover, not a tooltip** — deliberately. A tooltip's content is an
 * accessible *name* for its trigger: short, unfocusable, and not reliably
 * reachable by assistive tech or the keyboard. This holds a paragraph the
 * user is meant to read, so it needs to be focusable, escapable and
 * announced — which is what a popover is for. `openOnHover` keeps the
 * pointer experience feeling like a tooltip anyway.
 *
 * Hover does not exist on touch, so the trigger is a real button and a tap
 * opens the same popover — no interaction is pointer-only.
 */
export function ExtensionBadge(props: {
  /** The explanation. One or two sentences of prose. */
  children: ReactNode
  /** Accessible name for the trigger, e.g. "About list colours". */
  label: string
}) {
  return (
    <Popover.Root>
      {/* `openOnHover`/`delay` live on Trigger, not Root, in @base-ui/react
          1.6 — hover is a property of the thing being hovered, and a Root
          can have several triggers. */}
      <Popover.Trigger
        className={styles['trigger']}
        aria-label={props.label}
        openOnHover
        delay={200}
      >
        <LuInfo aria-hidden="true" size={14} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className={styles['positioner']} sideOffset={6}>
          <Popover.Popup className={styles['popup']}>
            {props.children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
