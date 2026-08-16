import type { Todo, TodoList } from '@fold/schemas'
import { useState } from 'react'
import { ClearCompletedDialog } from '../clear-completed-dialog/clear-completed-dialog'
import { useClearCompleted } from '../hooks/use-clear-completed'
import { countClearable, retentionCutoff, todosToClear } from '../lib/retention'
import { ViewNote } from '../view-note/view-note'
import { DaySection } from '../day-section/day-section'
import { RETENTION_DAYS } from '../lib/retention'
import { dayLabel, summariseCompleted } from '../lib/summary'
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
  const clearCompleted = useClearCompleted()
  const [clearing, setClearing] = useState(false)
  // One instant for the render, so every row is judged against the same
  // cutoff rather than drifting as the list is walked.
  const cutoff = retentionCutoff()

  const now = new Date()
  const { days, undated, beyondWindow } = summariseCompleted(todos)

  return (
    <div className={paneStyles['pane']}>
      {/* No empty-state copy. The title names the view, the count line
          reads "No todos", and the badge beside the title explains what
          this view gathers — a fourth sentence restated what three
          elements already carried. The same call was made for Today and
          Tomorrow the same day (today-pane.tsx).
          *(removed 2026-08-05.)* */}

      {/* One day per section, drawn by the shared component
          (day-section.tsx). It was this pane's own markup until 2026-08-14,
          when Next 7 days needed the same shape and the two would otherwise
          have been copy-paste. */}
      {days.map((group) => (
        <DaySection
          key={group.day}
          label={dayLabel(group.day, now)}
          todos={group.todos}
          lists={props.lists}
          now={now}
          // docs/specs/list-kinds.md — health leads within its day, but
          // with **no subheading here** and a heart instead. The block
          // exists to make outstanding health work impossible to leave
          // unseen; these are already done, so the heart alone carries the
          // category and the day stays one uninterrupted run of rows.
          // Next 7 days makes the opposite call for the opposite reason.
          // *(added 2026-08-05, issue #27.)*
          heartHealth
          onOpen={props.onOpen}
          onOpenList={props.onOpenList}
        />
      ))}

      {/* docs/specs/summary-view.md — a completed todo with no COMPLETED
          stamp can't be placed on a day. Say so rather than under-report
          silently. */}
      {undated > 0 && (
        <ViewNote>
          {undated} completed {undated === 1 ? 'todo has' : 'todos have'} no
          completion date, so {undated === 1 ? "it can't" : "they can't"} be
          placed on a day here. Look for the <em>No completion date</em> mark on
          the row in its own list.
        </ViewNote>
      )}
      {/* docs/specs/summary-view.md — the retention window. Older work is
          still on the server and still in its list; saying so keeps the
          edge of the view from reading as the edge of the history. */}
      {beyondWindow > 0 && (
        <ViewNote
          actionLabel="Clear completed…"
          onAction={() => setClearing(true)}
        >
          {beyondWindow} older {beyondWindow === 1 ? 'todo' : 'todos'} finished
          more than {RETENTION_DAYS} days ago{' '}
          {beyondWindow === 1 ? 'is' : 'are'} still in{' '}
          {beyondWindow === 1 ? 'its list' : 'their lists'}, beyond what this
          view shows.
        </ViewNote>
      )}

      {/* docs/specs/todos.md — clearing completed todos. From here the
          clear reaches *every* list, since this view gathers finished work
          from all of them — the dialog says so, because the blast radius
          is what the user is consenting to. */}
      <ClearCompletedDialog
        open={clearing}
        counts={countClearable(todos, cutoff)}
        scope="all"
        onOpenChange={setClearing}
        onClear={(which) => clearCompleted(todosToClear(todos, cutoff, which))}
      />
    </div>
  )
}
