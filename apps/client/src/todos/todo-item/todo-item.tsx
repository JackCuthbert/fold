import type { Todo } from '@fold/schemas'
import { LuHeart } from 'react-icons/lu'
import { Checkbox } from '../checkbox/checkbox'
import { TodoMeta, type RowList } from '../todo-meta/todo-meta'
import styles from './todo-item.module.css'

interface TodoItemProps {
  todo: Todo
  now: Date
  onToggle: () => void
  /**
   * Opens the detail panel. Receives the row's own button so focus can be
   * returned to it when the panel closes — the panel is a non-modal column
   * on desktop (docs/specs/ui.md — the detail panel), so nothing restores
   * focus automatically, and the explicit element is trustworthy where a
   * heuristic isn't once a re-render reorders the rows (the same reasoning
   * as `triggerRef` in add-todo-modal.tsx). *(added 2026-08-03, issue #4.)*
   */
  onOpen: (trigger: HTMLElement) => void
  /**
   * The list this todo belongs to, when that is worth saying.
   *
   * Derived views pass one, since their rows come from several
   * (docs/specs/today-view.md). A plain list passes nothing: every row on
   * screen is already in the list you are looking at, so naming it on each
   * would be noise. *(was `badge`, a ReactNode, until issue #2 — the pill
   * needs the list's colour, so the row takes the data and renders it.)*
   */
  list?: RowList | undefined
  /**
   * Marks this row as health (docs/specs/list-kinds.md — health first).
   *
   * A heart on the summary line rather than another word: the row already
   * names its list in the meta, and "Health ♥" would say the same thing
   * twice. Colour is not the only signal — the glyph has an accessible
   * label, and the block's own heading names it.
   *
   * Deliberately *not* in the meta cluster. Those are pills — facts about
   * the todo, in a shared shape. This is a mark on the todo itself, of a
   * kind nothing else in the row shares, and among the pills it read as a
   * pill that had lost its background. *(moved 2026-08-10.)*
   */
  health?: boolean
}

export function TodoItem(props: TodoItemProps) {
  const { todo } = props
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
      <button
        type="button"
        className={styles['body']}
        onClick={(event) => props.onOpen(event.currentTarget)}
      >
        {/* docs/specs/ui.md — the todo row: the summary owns its own line
            and ellipses there. It used to share the line with the meta
            cluster, which competed for width and truncated a long summary
            far earlier than the row needed to (issue #2). */}
        <span className={styles['summaryLine']}>
          <span className={styles['summary']}>{todo.summary}</span>
          {/* Trails the line, in its own column at the row's edge
              (docs/specs/list-kinds.md — health first).

              Leading the line put it *inside* the text flow, which pushed
              the summary 16px right of every ordinary row's — so a mixed
              list no longer shared one left edge (docs/specs/ui.md).
              Measured across the alternatives: this and the meta-cluster
              placement were the only ones that held the edge, and the meta
              made it read as a pill that had lost its background.
              *(moved 2026-08-10.)* */}
          {props.health && (
            <span className={styles['health']}>
              <LuHeart size={12} aria-hidden="true" />
              <span className={styles['srOnly']}>Health</span>
            </span>
          )}
        </span>
        {todo.description && (
          <span className={styles['description']}>{todo.description}</span>
        )}
        <TodoMeta
          todo={todo}
          now={props.now}
          {...(props.list ? { list: props.list } : {})}
        />
      </button>
    </li>
  )
}
