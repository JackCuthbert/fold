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
export function TodayPane(props: {
  lists: readonly TodoList[]
  // Selection lives in MainScreen — see TodoPane's `onOpen`
  // (docs/specs/ui.md — the detail panel; issue #4).
  onOpen: (todo: Todo, trigger: HTMLElement | null) => void
}) {
  const { todos } = useTodayTodos(props.lists)
  const { playPop } = useSound()
  // docs/specs/today-view.md — completed: expanded by default here, unlike
  // a list view. Today is a single day's slice, so its completed section is
  // short and is the day's finished work rather than an ever-growing
  // archive — worth seeing at a glance. Still collapsible; this is only the
  // initial state.
  const [showCompleted, setShowCompleted] = useState(true)

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
            onOpen={(trigger) => props.onOpen(todo, trigger)}
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
                  onOpen={(trigger) => props.onOpen(todo, trigger)}
                />
              ))}
            </ul>
            {/* No "Clear completed" here: it would delete across several
                lists at once from a view that only shows today's slice of
                each. That belongs in the list itself. */}
          </Collapsible.Panel>
        </Collapsible.Root>
      )}
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
 *
 * Shared with the Summary view (docs/specs/summary-view.md), which has the
 * same cross-list problem.
 */
export function TodayRow(props: {
  todo: Todo
  now: Date
  listName: string
  onOpen: (trigger: HTMLElement) => void
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

/**
 * The detail panel bound to the opened todo's own list.
 *
 * This is the seam that gives the panel its mutation actions from its new
 * home outside `<main>`: `useTodoActions` is keyed by list, and the panel
 * is rendered once at the top level for todos that may come from any list,
 * so the binding has to happen here — where the opened todo's `listId` is
 * known — rather than in a pane. Used by every view, not just Today and
 * Summary, now that MainScreen owns selection (issue #4).
 * *(changed 2026-08-03: was rendered by Today/Summary; now by MainScreen.)*
 */
export function TodayDetail(props: {
  todo: Todo
  lists: readonly TodoList[]
  mode: 'sheet' | 'column'
  /** Column mode only — see TodoDetail. */
  focusNonce?: number
  onClose: () => void
}) {
  const actions = useTodoActions(props.todo.listId)
  return (
    <TodoDetail
      todo={props.todo}
      lists={props.lists}
      mode={props.mode}
      {...(props.focusNonce === undefined
        ? {}
        : { focusNonce: props.focusNonce })}
      onSave={(changes) => actions.update(props.todo, changes)}
      onMove={(targetListId) => actions.move(props.todo, targetListId)}
      onDelete={() => {
        actions.remove(props.todo)
        props.onClose()
      }}
      onClose={props.onClose}
    />
  )
}
