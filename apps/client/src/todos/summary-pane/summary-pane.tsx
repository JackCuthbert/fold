import type { Todo, TodoList } from '@fold/schemas'
import { groupTodos, isHealthTodo, partitionHealth } from '../lib/group-by-list'
import { GroupRow } from '../group-row/group-row'
import { dayLabel, summariseCompleted } from '../lib/summary'
import styles from './summary-pane.module.css'
import { TodayRow } from '../today-pane/today-pane'
import paneStyles from '../todo-pane/todo-pane.module.css'
import { useTodayTodos } from '../hooks/use-today-todos'

// docs/specs/summary-view.md — finished work, grouped by the day it was
// finished. Where Today looks forward (what is due), this looks back (what
// got done) — the answer to "what did I do yesterday?" before a standup.
//
// Reuses TodayRow/TodayDetail: both views draw todos from several lists at
// once, so both need each row bound to its *own* list's actions.
interface SummaryPaneProps {
  lists: readonly TodoList[]
  // Selection lives in MainScreen — see TodoPane's `onOpen`
  // (docs/specs/ui.md — the detail panel; issue #4).
  onOpen: (todo: Todo, trigger: HTMLElement | null) => void
  /** Go to a list — what a grouped row does (docs/specs/list-kinds.md). */
  onOpenList: (listId: string) => void
}

export function SummaryPane(props: SummaryPaneProps) {
  const { todos } = useTodayTodos(props.lists)

  const now = new Date()
  const { days, undated } = summariseCompleted(todos)

  const listName = (listId: string): string =>
    props.lists.find((list) => list.id === listId)?.displayName ?? ''

  return (
    <div className={paneStyles['pane']}>
      {/* No empty-state copy. The title names the view, the count line
          reads "No todos", and the badge beside the title explains what
          this view gathers — a fourth sentence restated what three
          elements already carried. The same call was made for Today and
          Tomorrow the same day (today-pane.tsx).
          *(removed 2026-08-05.)* */}

      {days.map((group) => {
        // docs/specs/list-kinds.md — health leads, here *within its day*:
        // this view is a record read by date, so lifting a health todo out
        // of its day and up the page would put it under the wrong heading.
        //
        // No bordered block either, unlike Today. The block exists to make
        // outstanding health work impossible to leave unseen; these are
        // already done, so the heart alone carries the category and the day
        // stays one uninterrupted run of rows.
        // *(added 2026-08-05, issue #27.)*
        const { health, rest } = partitionHealth(group.todos, props.lists)
        const rows = groupTodos([...health, ...rest], props.lists)
        return (
          <section key={group.day} className={styles['day']}>
            {/* A heading per day rather than a divider: this view is read by
              scanning for a date, so the date must be the loudest thing on
              the row (docs/specs/summary-view.md). */}
            {/* docs/specs/list-kinds.md — the count counts *rows*, so a
              grouped list contributes 1. Counting the todos behind the
              group instead put "10" above three visible rows, and a
              number that disagrees with what is on screen is worse than
              one that undersells the day: the shopping genuinely was one
              errand.
              *(changed 2026-08-05: was a count of todos.)* */}
            <h2 className={styles['dayHeading']}>
              {dayLabel(group.day, now)}
              <span className={styles['dayCount']}>{rows.length}</span>
            </h2>
            <ul className={paneStyles['list']}>
              {rows.map((row) =>
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
                    listName={listName(row.todo.listId)}
                    {...(isHealthTodo(row.todo, props.lists)
                      ? { health: true }
                      : {})}
                    onOpen={(trigger) => props.onOpen(row.todo, trigger)}
                  />
                ),
              )}
            </ul>
          </section>
        )
      })}

      {/* docs/specs/summary-view.md — a completed todo with no COMPLETED
          stamp can't be placed on a day. Say so rather than under-report
          silently. */}
      {undated > 0 && (
        <p className={styles['undated']}>
          {undated} completed {undated === 1 ? 'todo has' : 'todos have'} no
          completion date, so {undated === 1 ? "it isn't" : "they aren't"} shown
          above.
        </p>
      )}
    </div>
  )
}
