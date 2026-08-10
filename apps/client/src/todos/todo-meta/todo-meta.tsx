import type { Todo, TodoPriority } from '@fold/schemas'
import {
  LuChevronDown,
  LuChevronUp,
  LuClock,
  LuCircleHelp,
  LuMinus,
} from 'react-icons/lu'
import { cx } from '../../styles/cx'
import { dueInstant, isOverdue } from '../lib/sort'
import styles from './todo-meta.module.css'

/**
 * The list a row came from. Only derived views pass one: inside a plain
 * list every row belongs to the list you are already looking at, so
 * repeating its name on each would be noise
 * (docs/specs/ui.md — the todo row).
 */
export interface RowList {
  displayName: string
  color?: string | undefined
}

export interface TodoMetaProps {
  todo: Todo
  now: Date
  list?: RowList | undefined
}

/**
 * The row's second line: which list, how urgent, when it is due.
 *
 * docs/specs/ui.md — the todo row. These facts used to share the summary's
 * line, competing with it for width and forcing the summary to truncate
 * early. On their own line the summary gets the full width, and the facts
 * get room to be legible rather than abbreviated.
 *
 * **Two pill treatments, split by who owns the colour.** A list's colour is
 * arbitrary — it can arrive from Apple Reminders or a hex field — so the
 * list pill is a hairline outline and the colour goes on its dot alone,
 * where no legibility threshold applies. Priority and due dates use colours
 * the app itself defines, so they can be soft fills whose contrast is known
 * at build time. Nothing here ever paints an arbitrary colour behind text,
 * which is what makes a contrast guard unnecessary.
 *
 * **Icons, not colour alone.** Overdue and high priority were both a red
 * fill with red text, so a row reading "high · Aug 2" showed one treatment
 * twice for two unrelated facts. A clock marks overdue (it is about time)
 * and a chevron marks priority rank, so the two are told apart by shape as
 * well as hue — which is also what makes them distinguishable to anyone who
 * cannot separate the reds.
 *
 * *(added 2026-08-09, issue #2.)*
 */
export function TodoMeta(props: TodoMetaProps) {
  const due = formatDue(props.todo)
  const overdue = !props.todo.completed && isOverdue(props.todo, props.now)
  const priority = props.todo.priority
  // docs/specs/summary-view.md — a completed todo with no COMPLETED stamp
  // cannot be placed on a day, so Summary leaves it out and says how many
  // it could not place. That count named todos the user had no way to
  // find: this is where they are findable (issue #39).
  const undated = props.todo.completed && !props.todo.completedAt

  // Nothing to say: render no line at all rather than an empty one, so an
  // unadorned todo keeps the row height it has without this.
  if (!props.list && !priority && !due && !undated) {
    return null
  }

  return (
    <span className={styles['meta']}>
      {props.list && (
        <span className={styles['list']}>
          {/* The dot is the app's marker for "a list" — the same mark the
              nav uses — not merely a swatch. It is always drawn, whatever
              the colour, so the pill says "list" before it says anything
              about which one. An uncoloured list gets the shared empty
              ring rather than nothing. */}
          <span
            className={cx(
              styles['dot'],
              props.list.color === undefined && styles['dotEmpty'],
            )}
            {...(props.list.color === undefined
              ? {}
              : { style: { background: props.list.color } })}
            aria-hidden="true"
          />
          {props.list.displayName}
        </span>
      )}

      {priority && (
        <span className={cx(styles['pill'], styles[PRIORITY_CLASS[priority]])}>
          {PRIORITY_ICON[priority]}
          {priority}
        </span>
      )}

      {due && (
        <span
          className={cx(
            styles['pill'],
            overdue ? styles['overdue'] : styles['due'],
          )}
        >
          {overdue && <LuClock size={11} aria-hidden="true" />}
          {due}
        </span>
      )}

      {/* Last in the line: it qualifies the todo's completion rather than
          being another property of it, and it is rare enough that leading
          with it would overstate the case. */}
      {undated && (
        <span className={cx(styles['pill'], styles['undated'])}>
          <LuCircleHelp size={11} aria-hidden="true" />
          No completion date
        </span>
      )}
    </span>
  )
}

// docs/specs/todos.md — priority is colour-coded, all three levels. The
// icon carries the *rank* so the meaning survives without colour.
const PRIORITY_CLASS: Record<TodoPriority, string> = {
  high: 'high',
  medium: 'medium',
  low: 'low',
}

const PRIORITY_ICON: Record<TodoPriority, React.ReactElement> = {
  high: <LuChevronUp size={11} aria-hidden="true" />,
  medium: <LuMinus size={11} aria-hidden="true" />,
  low: <LuChevronDown size={11} aria-hidden="true" />,
}

/** Exported for unit testing — the all-day/timed distinction is subtle. */
export const formatDue = (todo: Todo): string | null => {
  const due = todo.due
  if (!due) return null
  // dueInstant resolves all four forms consistently — see
  // docs/specs/todos.md#ordering-and-overdue-comparison.
  const instant = new Date(dueInstant(todo))
  const date = instant.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
  // docs/specs/todos.md — due times: only a timed todo shows a time. An
  // all-day `date` resolves to 23:59:59 for ordering, so formatting the
  // instant unconditionally would label every all-day todo "11:59 pm".
  if (due.kind === 'date') return date
  // The locale's own short time. No hand-trimming: dropping ":00" reads as
  // a bare "9" in 24-hour locales, which is ambiguous beside a date.
  const time = instant.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
  return `${date} ${time}`
}
