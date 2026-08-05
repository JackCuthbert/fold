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
    <section className={styles['section']} aria-label="Health">
      {/* Above the box, not inside it. The heading labels the block the way
          Summary's day headings label their days — a caption sits outside
          the thing it names, and inside the border it read as a first row
          of the block's own content, competing with the todos below it.
          It also lets the box hold nothing but rows, so its padding is
          uniform without the heading's own spacing to reconcile.
          *(moved 2026-08-05.)*

          The heading names the category, so the rows' hearts are never the
          only thing carrying it — colour and iconography are never the
          sole signal (docs/specs/ui.md — accessibility). */}
      <h2 className={styles['heading']}>
        <LuHeart className={styles['heart']} size={13} aria-hidden="true" />
        Health
      </h2>
      <div className={styles['block']}>
        <ul className={paneStyles['list']}>{props.children}</ul>
      </div>
    </section>
  )
}
