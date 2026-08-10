import { Collapsible } from '@base-ui/react/collapsible'
import type { Todo, TodoList } from '@fold/schemas'
import { useState } from 'react'
import { LuChevronRight } from 'react-icons/lu'
import { ConfirmDialog } from '../../ui'
import { duplicateTodo } from '../lib/duplicate-todo'
import { groupTodos, isHealthTodo, partitionHealth } from '../lib/group-by-list'
import { GroupRow } from '../group-row/group-row'
import { HealthBlock } from '../health-block/health-block'
import { useSound } from '../../sound'
import { cx } from '../../styles/cx'
import { sortActiveTodos } from '../lib/sort'
import { rowListFor } from '../lib/row-list'
import type { RowList } from '../todo-meta/todo-meta'
import { selectToday, selectTomorrow, sortByDueInstant } from '../lib/today'
import { TodoDetail } from '../todo-detail/todo-detail'
import { TodoItem } from '../todo-item/todo-item'
import paneStyles from '../todo-pane/todo-pane.module.css'
import { useTodayTodos } from '../hooks/use-today-todos'
import { useTodoActions } from '../hooks/use-todo-actions'
import type { TodoDetailForm } from '../hooks/use-todo-detail-form'

// docs/specs/today-view.md. Deliberately *not* a mode inside TodoPane: the
// two differ in where their todos come from (many lists vs one), how they
// order them (by due instant vs the standard rules), and whether they can
// create (Today cannot). Threading three flags through TodoPane would make
// both harder to read than keeping them separate.
//
// Today and Tomorrow, by contrast, **are** the same pane
// (docs/specs/tomorrow-view.md): same source, same ordering, same grouping,
// same health block, same Completed accordion — only the day window
// differs. So `day` selects the window and everything else is shared. Two
// copies of this component would have been a hundred duplicated lines that
// drift the first time one of them is fixed, which is the opposite trade
// from the TodoPane one above. *(added 2026-08-05.)*
interface TodayPaneProps {
  lists: readonly TodoList[]
  /** Which day's slice to show. Defaults to today. */
  day?: 'today' | 'tomorrow'
  // Selection lives in MainScreen — see TodoPane's `onOpen`
  // (docs/specs/ui.md — the detail panel; issue #4).
  onOpen: (todo: Todo, trigger: HTMLElement | null) => void
  /** Go to a list — what a grouped row does (docs/specs/list-kinds.md). */
  onOpenList: (listId: string) => void
}

export function TodayPane(props: TodayPaneProps) {
  const { todos } = useTodayTodos(props.lists)
  const { playPop } = useSound()
  // docs/specs/today-view.md — completed: expanded by default here, unlike
  // a list view. Today is a single day's slice, so its completed section is
  // short and is the day's finished work rather than an ever-growing
  // archive — worth seeing at a glance. Still collapsible; this is only the
  // initial state.
  const [showCompleted, setShowCompleted] = useState(true)

  const now = new Date()
  // Tomorrow selects outstanding work only, so `completed` below comes out
  // empty there and the accordion suppresses itself — no branch needed.
  // A todo ticked off early belongs to the day it was *done*, so it moves
  // to Today (docs/specs/tomorrow-view.md).
  const due =
    props.day === 'tomorrow'
      ? selectTomorrow(todos, now)
      : selectToday(todos, now)
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

  const rowList = (listId: string) => rowListFor(props.lists, listId)

  // docs/specs/list-kinds.md — health leads, in its own block. Split
  // before grouping: the two rules do not interact (no kind both leads and
  // groups), but partitioning first keeps each half's grouping independent.
  // *(added 2026-08-05, issue #27.)*
  const { health: healthActive, rest: restActive } = partitionHealth(
    active,
    props.lists,
  )

  // docs/specs/list-kinds.md — grouping, applied after sorting so a group
  // takes the position of its earliest todo rather than being appended.
  // Both halves are grouped: eight things still to buy is one errand, not
  // eight tasks. *(added 2026-08-05, issue #27.)*
  const activeRows = groupTodos(restActive, props.lists)
  const completedRows = groupTodos(completed, props.lists)

  return (
    <div className={paneStyles['pane']}>
      {/* Above the main list, and outside it: this is its own section, not
          a run of specially-styled rows within one list
          (docs/specs/list-kinds.md). Completed health todos are *not*
          lifted — a finished one needs no chasing, so it joins the
          ordinary Completed accordion below. */}
      <HealthBlock count={healthActive.length}>
        {healthActive.map((todo) => (
          // No `health` heart on these rows: the block they sit in is
          // already titled "Health", and every row also names its list in
          // the meta cluster — a heart there made three statements of the
          // same fact. The heart earns its place where there is no block
          // (Summary, and Today's Completed section).
          // *(changed 2026-08-05.)*
          <TodayRow
            key={todo.uid}
            todo={todo}
            now={now}
            list={rowList(todo.listId)}
            onOpen={(trigger) => props.onOpen(todo, trigger)}
            onToggled={playPop}
          />
        ))}
      </HealthBlock>

      <ul className={paneStyles['list']}>
        {activeRows.map((row) =>
          row.kind === 'group' ? (
            <GroupRow
              key={`group:${row.listId}`}
              group={row}
              onOpenList={props.onOpenList}
            />
          ) : (
            <TodayRow
              key={row.todo.uid}
              todo={row.todo}
              now={now}
              list={rowList(row.todo.listId)}
              onOpen={(trigger) => props.onOpen(row.todo, trigger)}
              onToggled={playPop}
            />
          ),
        )}
      </ul>

      {/* docs/specs/today-view.md — no "Add a todo" row: a derived view has
          no collection to add to.

          **And no empty-state copy either.** A line here was tried and
          removed the same day: the title says which day, the count line
          says "No todos", and the badge beside the title explains what the
          view gathers — so a fourth sentence restated what three elements
          already carried. An empty day is an ordinary state, and the
          quietest way to show it is to show nothing.
          *(added and removed 2026-08-05.)* */}

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
            {/* docs/specs/list-kinds.md — rows, not todos: four completed
                groceries are one row behind this trigger, so counting the
                todos claimed six where five were visible. The condition
                above can stay on `completed` — "is there anything at all"
                has the same answer either way. *(fixed 2026-08-05.)* */}
            Completed ({completedRows.length})
          </Collapsible.Trigger>
          <Collapsible.Panel>
            <ul className={cx(paneStyles['list'], paneStyles['completedList'])}>
              {completedRows.map((row) =>
                row.kind === 'group' ? (
                  <GroupRow
                    key={`group:${row.listId}`}
                    group={row}
                    onOpenList={props.onOpenList}
                  />
                ) : (
                  <TodayRow
                    key={row.todo.uid}
                    todo={row.todo}
                    now={now}
                    list={rowList(row.todo.listId)}
                    {...(isHealthTodo(row.todo, props.lists)
                      ? { health: true }
                      : {})}
                    onOpen={(trigger) => props.onOpen(row.todo, trigger)}
                  />
                ),
              )}
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
interface TodayRowProps {
  todo: Todo
  now: Date
  /** The row's source list — named and coloured on the row (issue #2). */
  list: RowList | undefined
  /** Marks the row as health — docs/specs/list-kinds.md. */
  health?: boolean
  onOpen: (trigger: HTMLElement) => void
  onToggled?: () => void
}

export function TodayRow(props: TodayRowProps) {
  const actions = useTodoActions(props.todo.listId)
  const { todo } = props

  return (
    <TodoItem
      todo={todo}
      now={props.now}
      {...(props.health ? { health: true } : {})}
      {...(props.list ? { list: props.list } : {})}
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
 *
 * Only Delete is bound here now. Save and Move belong to the form, which
 * lives in MainScreen so it outlives either surface across the breakpoint
 * (use-todo-detail-form.ts) — binding them here would put them back inside
 * a component that unmounts at 768px.
 * *(changed 2026-08-03: was the whole action set.)*
 */
interface TodayDetailProps {
  todo: Todo
  lists: readonly TodoList[]
  form: TodoDetailForm
  mode: 'sheet' | 'column'
  /** Sheet mode only — see TodoDetail, which explains why it must not
      unmount on close. */
  open?: boolean
  /** Column mode only — see TodoDetail. */
  focusNonce?: number
  /**
   * A copy was created — open it. Optional so a surface that doesn't own
   * selection can omit it (issue #25).
   */
  onDuplicated?: (copy: Todo) => void
  /** Open the move dialog for this todo (issue #38). */
  onMove: () => void
  onClose: () => void
}

export function TodayDetail(props: TodayDetailProps) {
  const actions = useTodoActions(props.todo.listId)
  // docs/specs/todos.md — deleting a todo asks first. A delete is
  // unrecoverable: the resource is removed from the server outright and
  // there is no undo, so the one-click version destroyed real work
  // (issue #19).
  const [confirming, setConfirming] = useState(false)
  return (
    <>
      <TodoDetail
        todo={props.todo}
        lists={props.lists}
        form={props.form}
        mode={props.mode}
        onMove={props.onMove}
        {...(props.open === undefined ? {} : { open: props.open })}
        {...(props.focusNonce === undefined
          ? {}
          : { focusNonce: props.focusNonce })}
        onDelete={() => setConfirming(true)}
        onDuplicate={() => {
          // The copy lands in the *source's* list, so `actions` (bound to
          // that list) is the right writer. Opening the copy is what makes
          // this one click rather than two: the next thing you do is
          // almost always edit it (issue #25).
          const copy = duplicateTodo(props.todo, crypto.randomUUID())
          actions.add(copy)
          // The same shape `applyMutationToTodos` gives the optimistic
          // placeholder (sync/optimistic.ts) — so the panel can switch to
          // the copy immediately rather than waiting for a round trip.
          props.onDuplicated?.({
            ...copy,
            listId: props.todo.listId,
            href: '',
            etag: '',
            completed: false,
          })
        }}
        onClose={props.onClose}
      />
      {/* A *sibling* of TodoDetail, never a child. In `sheet` mode the
          detail is itself a Dialog, and Base UI gives a nested dialog no
          backdrop of its own — the confirm would appear to float on the
          sheet's scrim with nothing dimming the sheet behind it. Rendering
          it here keeps both overlays top-level. */}
      <ConfirmDialog
        open={confirming}
        title="Delete this todo?"
        confirmLabel="Delete todo"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false)
          actions.remove(props.todo)
          props.onClose()
        }}
      >
        {/* The summary goes in the body, not the title: summaries run long
            and would wrap a heading badly (issue #19). */}
        <p>
          <strong>{props.todo.summary}</strong> will be deleted from the server.
          This can't be undone.
        </p>
      </ConfirmDialog>
    </>
  )
}
