import type { Todo } from '@caldav-todo/schemas'
import { Checkbox } from './checkbox'
import { dueInstant, isOverdue } from './sort'

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
  return (
    <li className={todo.completed ? 'todo todo--completed' : 'todo'}>
      <Checkbox
        checked={todo.completed}
        label={`Mark "${todo.summary}" ${todo.completed ? 'active' : 'done'}`}
        onToggle={props.onToggle}
      />
      <button type="button" className="todo__body" onClick={props.onOpen}>
        <span className="todo__summary">{todo.summary}</span>
        <span className="todo__meta">
          {todo.priority && (
            <span className={`prio prio--${todo.priority}`}>
              {todo.priority}
            </span>
          )}
          {formatDue(todo) && (
            <span className={overdue ? 'due due--overdue' : 'due'}>
              {formatDue(todo)}
            </span>
          )}
        </span>
      </button>
    </li>
  )
}
