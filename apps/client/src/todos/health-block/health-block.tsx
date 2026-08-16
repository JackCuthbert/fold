import type { ReactNode } from 'react'
import { LuHeart } from 'react-icons/lu'
import styles from './health-block.module.css'
import paneStyles from '../todo-pane/todo-pane.module.css'

/**
 * The health todos at the top of a derived view, under their own heading
 * (docs/specs/list-kinds.md — health first).
 *
 * **A heading and space, not a box.** It was a bordered, tinted block
 * until 2026-08-11; rows then gained hover and current states (issue #40)
 * and the box turned out to be doing two things badly — its tint competed
 * with the row washes, and its padding pushed its rows off the left edge
 * every other row shares. Health still leads and is still named, which is
 * what the spec actually asks for. See health-block.module.css.
 *
 * **Not a collapsible section.** The Completed accordion below can be
 * folded away because it is a record of work already done; this is work
 * still to do, and the whole point of lifting it here is that it should
 * not be possible to leave it unseen.
 *
 * Renders nothing when there is nothing in it — a heading over no rows
 * reads as a rendering fault.
 */
interface HealthBlockProps {
  children: ReactNode
  count: number
}

export function HealthBlock(props: HealthBlockProps) {
  if (props.count === 0) return null
  return (
    <section className={styles['section']} aria-label="Health">
      {/* The heading names the category, so the rows' hearts are never the
          only thing carrying it — colour and iconography are never the
          sole signal (docs/specs/ui.md — accessibility). Since 2026-08-11
          it is the *only* thing marking the section, the box having gone,
          which makes that doubly true. */}
      <h2 className={styles['heading']}>
        <LuHeart className={styles['heart']} size={13} aria-hidden="true" />
        Health
      </h2>
      <ul className={paneStyles['list']}>{props.children}</ul>
    </section>
  )
}
