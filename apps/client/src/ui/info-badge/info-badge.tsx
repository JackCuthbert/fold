import { Popover } from '@base-ui/react/popover'
import type { ReactNode } from 'react'
import type { IconType } from 'react-icons'
import { LuInfo } from 'react-icons/lu'
import styles from './info-badge.module.css'

/**
 * A small "what is this?" marker: an info glyph that opens a sentence or
 * two of prose explaining the thing it sits beside.
 *
 * Generic on purpose — it takes its own text. Two uses so far: a feature
 * that relies on a CalDAV **extension** rather than RFC 4791 (docs/specs/
 * lists.md — colours and ordering), and the derived views in the nav
 * (docs/specs/today-view.md, docs/specs/summary-view.md), which are views
 * over your todos rather than lists on the server.
 *
 * *(renamed 2026-08-03: was `ExtensionBadge`. The name described its first
 * use rather than what it is, and read oddly the moment it explained
 * something that is not an extension at all.)*
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
interface InfoBadgeProps {
  /** The explanation. One or two sentences of prose. */
  children: ReactNode
  /** Accessible name for the trigger, e.g. "About list colours". */
  label: string
  /**
   * The glyph, when the default `i` is not the right marker.
   *
   * Used by the list-kind sparkle (docs/specs/list-kinds.md), where the
   * icon carries meaning of its own — "this list does something extra" —
   * rather than the generic "there is an explanation here". Everything
   * else about the badge is identical, which is the point: the behaviour
   * and the popover treatment stay in one place.
   * *(added 2026-08-05, issue #27.)*
   */
  icon?: IconType
}

export function InfoBadge(props: InfoBadgeProps) {
  const Icon = props.icon ?? LuInfo
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
        <Icon aria-hidden="true" size={14} />
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
