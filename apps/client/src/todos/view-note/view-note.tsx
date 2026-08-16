import type { ReactNode } from 'react'
import styles from './view-note.module.css'

export interface ViewNoteProps {
  children: ReactNode
  /** The label for the note's action, when there is something to do. */
  actionLabel?: string
  onAction?: () => void
}

/**
 * A footnote below a view, saying what it is *not* showing.
 *
 * docs/specs/summary-view.md — Summary deliberately omits two kinds of
 * completed work: todos with no `COMPLETED` stamp, which cannot be placed
 * on a day, and work older than the retention window. Both are still on
 * the server, so a view that simply left them out would misreport the
 * history rather than bound it.
 *
 * **A note that names something should let you reach it.** These began as
 * loose muted paragraphs, which stated a count and stopped — you were told
 * six todos existed somewhere with no way to see or act on them. So a note
 * can carry an action, and reads as a distinct block rather than as prose
 * that trailed off the end of the list.
 *
 * Set apart with a rule and a tinted ground rather than more muted body
 * text: this is *about* the view rather than part of it, and at the foot of
 * a long scroll it needs to be findable rather than merely present.
 *
 * *(added 2026-08-09.)*
 */
export function ViewNote(props: ViewNoteProps) {
  return (
    <div className={styles['note']}>
      <p className={styles['text']}>{props.children}</p>
      {props.actionLabel && props.onAction && (
        <button
          type="button"
          className={styles['action']}
          onClick={props.onAction}
        >
          {props.actionLabel}
        </button>
      )}
    </div>
  )
}
