import type { ReactNode } from 'react'
import { LuHeart } from 'react-icons/lu'
import styles from './health-block.module.css'
import paneStyles from './todo-pane.module.css'

/**
 * The health todos at the top of a derived view, in a block of their own
 * (docs/specs/list-kinds.md — health first).
 *
 * **Not a collapsible section.** The Completed accordion below can be
 * folded away because it is a record of work already done; this is work
 * still to do, and the whole point of lifting it here is that it should
 * not be possible to leave it unseen.
 *
 * Renders nothing when there is nothing in it — unlike the bulk buttons,
 * an empty bordered box is not a control whose absence moves anything, and
 * an outline around no rows reads as a rendering fault.
 */
export function HealthBlock(props: { children: ReactNode; count: number }) {
  if (props.count === 0) return null
  return (
    <section className={styles['block']} aria-label="Health">
      {/* The heading names the block, so the rows' hearts are not the only
          thing carrying the category — colour and iconography are never
          the sole signal (docs/specs/ui.md — accessibility). */}
      <h2 className={styles['heading']}>
        <LuHeart className={styles['heart']} size={13} aria-hidden="true" />
        Health
      </h2>
      <ul className={paneStyles['list']}>{props.children}</ul>
    </section>
  )
}
