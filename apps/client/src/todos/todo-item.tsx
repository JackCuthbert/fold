import type { Todo, TodoPriority } from '@fold/schemas'
import type { ReactNode } from 'react'
import { cx } from '../styles/cx'
import { Checkbox } from './checkbox'
import { dueInstant, isOverdue } from './sort'
import styles from './todo-item.module.css'

// docs/specs/todos.md — priority is colour-coded on the row, all three
// levels: high red/urgent, medium amber/cautionary, low green/calm.
const PRIO_CLASS: Record<TodoPriority, string> = {
  high: styles['prioHigh'] ?? '',
  medium: styles['prioMedium'] ?? '',
  low: styles['prioLow'] ?? '',
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

export function TodoItem(props: {
  todo: Todo
  now: Date
  onToggle: () => void
  onOpen: () => void
  /**
   * Optional marker rendered in the meta row, before priority and due.
   * The Today view uses it to name each row's source list, since its rows
   * come from several (docs/specs/today-view.md). Lists pass nothing.
   */
  badge?: ReactNode
}) {
  const { todo } = props
  const overdue = !todo.completed && isOverdue(todo, props.now)
  const due = formatDue(todo)
  return (
    <li
      className={
        todo.completed
          ? `${styles['todo']} ${styles['todoCompleted']}`
          : styles['todo']
      }
    >
      <Checkbox
        checked={todo.completed}
        label={`Mark "${todo.summary}" ${todo.completed ? 'active' : 'done'}`}
        onToggle={props.onToggle}
      />
      <button type="button" className={styles['body']} onClick={props.onOpen}>
        <span className={styles['titleRow']}>
          <span className={styles['summary']}>{todo.summary}</span>
          <span className={styles['meta']}>
            {props.badge}
            {todo.priority && (
              <span className={cx(styles['prio'], PRIO_CLASS[todo.priority])}>
                {todo.priority}
              </span>
            )}
            {due && (
              <span className={overdue ? styles['dueOverdue'] : styles['due']}>
                {due}
              </span>
            )}
          </span>
        </span>
        {todo.description && (
          <span className={styles['description']}>{todo.description}</span>
        )}
      </button>
    </li>
  )
}
