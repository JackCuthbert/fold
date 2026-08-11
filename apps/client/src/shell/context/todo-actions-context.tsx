import type { Todo, TodoPriority } from '@fold/schemas'
import { createContext, use, type ReactNode } from 'react'
import type { ScheduleOffset } from '../../todos/lib/schedule'

export interface TodoRowActions {
  /** Tick or untick, exactly as the row's own checkbox does. */
  toggle: (todo: Todo) => void
  /**
   * Move the due date to today or tomorrow.
   *
   * Without `time`, keeps whatever the todo already carried; with one
   * (`HH:mm`), sets it — see `todos/lib/schedule`.
   */
  schedule: (todo: Todo, offset: ScheduleOffset, time?: string) => void
  /** Clear the due date. */
  unschedule: (todo: Todo) => void
  /** Set or clear the priority — `null` means none. */
  setPriority: (todo: Todo, priority: TodoPriority | null) => void
  /** Open the Move dialog, which MainScreen owns. */
  requestMove: (todo: Todo) => void
  /** Open the delete confirmation, which MainScreen owns. */
  requestDelete: (todo: Todo) => void
}

const TodoActionsContext = createContext<TodoRowActions | null>(null)

/**
 * What a todo row's context menu can do (docs/specs/todos.md — row
 * actions).
 *
 * A context for the same reason `SelectionContext` is one: every pane
 * renders rows, and every row needs these, but no pane between MainScreen
 * and the row has any use for them — threading five callbacks through
 * `TodoPane`, `TodayPane` and `HealthBlock` would say nothing except
 * "these are passed down" (CLAUDE.md — prefer a context to threading a
 * prop through a component that does not use it).
 *
 * **The two `request*` actions deliberately do not perform anything.**
 * Move and Delete both need an overlay, and Base UI renders no backdrop
 * for a *nested* dialog — on mobile the row sits inside the nav drawer's
 * own `Dialog`, so a dialog owned by the row would lose its scrim
 * entirely. That is the bug fixed in issue #38 and again in issue #50, so
 * the overlays stay MainScreen-level siblings and the row only asks.
 *
 * The direct actions (toggle, schedule, unschedule) have no such problem:
 * they are cache writes with no surface of their own.
 *
 * *(added 2026-08-11, issue #40.)*
 */
interface TodoActionsProviderProps {
  value: TodoRowActions
  children: ReactNode
}

export function TodoActionsProvider(props: TodoActionsProviderProps) {
  return (
    <TodoActionsContext value={props.value}>
      {props.children}
    </TodoActionsContext>
  )
}

export function useTodoRowActions(): TodoRowActions {
  const value = use(TodoActionsContext)
  if (!value) throw new Error('useTodoRowActions outside TodoActionsProvider')
  return value
}
