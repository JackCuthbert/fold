import type { Todo, TodoPriority } from '@fold/schemas'
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

const formatDue = (todo: Todo): string | null => {
  if (!todo.due) return null
  // dueInstant resolves all four forms consistently — see
  // docs/specs/todos.md#ordering-and-overdue-comparison.
  return new Date(dueInstant(todo)).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

export function TodoItem(props: {
  todo: Todo
  now: Date
  onToggle: () => void
  onOpen: () => void
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
