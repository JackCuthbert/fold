import { Collapsible } from '@base-ui/react/collapsible'
import type { Todo, TodoList } from '@fold/schemas'
import { useState } from 'react'
import { LuChevronRight } from 'react-icons/lu'
import { useSound } from '../sound/use-sound'
import { cx } from '../styles/cx'
import { sortActiveTodos } from './sort'
import styles from './today-pane.module.css'
import { selectToday, sortByDueInstant } from './today'
import { TodoDetail } from './todo-detail'
import { TodoItem } from './todo-item'
import paneStyles from './todo-pane.module.css'
import { useTodayTodos } from './use-today-todos'
import { useTodoActions } from './use-todo-actions'

// docs/specs/today-view.md. Deliberately *not* a mode inside TodoPane: the
// two differ in where their todos come from (many lists vs one), how they
// order them (by due instant vs the standard rules), and whether they can
// create (Today cannot). Threading three flags through TodoPane would make
// both harder to read than keeping them separate.
export function TodayPane(props: { lists: readonly TodoList[] }) {
  const { todos } = useTodayTodos(props.lists)
  const { playPop } = useSound()
  const [openUid, setOpenUid] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)

  const now = new Date()
  const due = selectToday(todos, now)
  // Sorted by due instant, soonest first, so overdue leads
  // (docs/specs/today-view.md — ordering). `sortActiveTodos` runs first so
  // same-instant ties keep the app's standard, stable order — toSorted is
  // specified as stable, so the second pass preserves it.
  const active = sortByDueInstant(
    sortActiveTodos(
      due.filter((todo) => !todo.completed),
      now,
    ),
  )
  const completed = sortByDueInstant(due.filter((todo) => todo.completed))
  const open = due.find((todo) => todo.uid === openUid)

  const listName = (listId: string): string =>
    props.lists.find((list) => list.id === listId)?.displayName ?? ''

  return (
    <div className={paneStyles['pane']}>
      <ul className={paneStyles['list']}>
        {active.map((todo) => (
          <TodayRow
            key={todo.uid}
            todo={todo}
            now={now}
            listName={listName(todo.listId)}
            onOpen={() => setOpenUid(todo.uid)}
            onToggled={playPop}
          />
        ))}
      </ul>

      {/* docs/specs/today-view.md — no "Add a todo" row: a derived view has
          no collection to add to. */}

      {completed.length > 0 && (
        <Collapsible.Root
          className={cx(paneStyles['completed'])}
          open={showCompleted}
          onOpenChange={setShowCompleted}
          render={<section />}
        >
          <Collapsible.Trigger className={cx(paneStyles['completedToggle'])}>
            <LuChevronRight
              className={paneStyles['chevron']}
              aria-hidden="true"
              size={14}
            />
            Completed ({completed.length})
          </Collapsible.Trigger>
          <Collapsible.Panel>
            <ul className={cx(paneStyles['list'], paneStyles['completedList'])}>
              {completed.map((todo) => (
                <TodayRow
                  key={todo.uid}
                  todo={todo}
                  now={now}
                  listName={listName(todo.listId)}
                  onOpen={() => setOpenUid(todo.uid)}
                />
              ))}
            </ul>
            {/* No "Clear completed" here: it would delete across several
                lists at once from a view that only shows today's slice of
                each. That belongs in the list itself. */}
          </Collapsible.Panel>
        </Collapsible.Root>
      )}

      {open && <TodayDetail todo={open} onClose={() => setOpenUid(null)} />}
    </div>
  )
}

/**
 * One row, bound to its *own* list's actions.
 *
 * Todos here come from several lists, and mutations are keyed by list
 * (use-todo-actions.ts), so each row resolves its own writer rather than
 * sharing one — otherwise completing a todo would write to the wrong
 * list's cache (docs/specs/today-view.md — fetching).
 */
function TodayRow(props: {
  todo: Todo
  now: Date
  listName: string
  onOpen: () => void
  onToggled?: () => void
}) {
  const actions = useTodoActions(props.todo.listId)
  const { todo } = props

  return (
    <TodoItem
      todo={todo}
      now={props.now}
      badge={
        props.listName ? (
          <span className={styles['listBadge']}>{props.listName}</span>
        ) : null
      }
      onToggle={() => {
        actions.update(todo, { completed: !todo.completed })
        if (!todo.completed) props.onToggled?.()
      }}
      onOpen={props.onOpen}
    />
  )
}

/** Detail sheet bound to the opened todo's own list. */
function TodayDetail(props: { todo: Todo; onClose: () => void }) {
  const actions = useTodoActions(props.todo.listId)
  return (
    <TodoDetail
      todo={props.todo}
      onSave={(changes) => actions.update(props.todo, changes)}
      onDelete={() => {
        actions.remove(props.todo)
        props.onClose()
      }}
      onClose={props.onClose}
    />
  )
}
