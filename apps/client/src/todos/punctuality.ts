import type { Todo } from '@fold/schemas'
import { dueInstant } from './sort'

// docs/specs/todos.md — metadata: was it done on time? Derived by comparing
// COMPLETED against DUE, so it costs no extra storage and is available for
// every todo that carries both.

/**
 * Three outcomes, mapped to the app's semantic status colours
 * (docs/specs/ui.md — status display):
 *
 * - `early`  — comfortably ahead of the deadline (green)
 * - `onTime` — met it (green): meeting a deadline is meeting it, so this
 *   reads as a success rather than a caution.
 * - `late`   — missed it (red)
 *
 * The three kinds stay distinct even though two share a colour: the label
 * still says which, and a future view may want to tell them apart.
 */
export type Punctuality = 'early' | 'onTime' | 'late'

export interface PunctualityResult {
  kind: Punctuality
  /** Ready-to-render sentence, e.g. "On time — 2 hours early". */
  label: string
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const plural = (count: number, unit: string): string =>
  `${count} ${unit}${count === 1 ? '' : 's'}`

/**
 * A rough margin, in the largest unit that still says something useful.
 * Deliberately imprecise: "about 3 hours" is the honest reading of a gap
 * nobody measured to the minute, and exact figures here would be precision
 * theatre (docs/specs/todos.md — metadata).
 */
const roughly = (ms: number): string => {
  if (ms < HOUR) return plural(Math.max(1, Math.round(ms / MINUTE)), 'minute')
  if (ms < DAY) return plural(Math.round(ms / HOUR), 'hour')
  return plural(Math.round(ms / DAY), 'day')
}

/**
 * How a completed todo fared against its due date, or `null` when there is
 * nothing to compare — no due date, no completion stamp, or an unparseable
 * one. Callers render nothing in that case rather than guessing.
 *
 * All-day todos are judged **by the day, not the instant**. `dueInstant`
 * resolves `DUE;VALUE=DATE` to 23:59:59 local so that an all-day todo isn't
 * flagged overdue until its day is out; comparing against that literally
 * would report a 3pm completion as "9 hours early", which is not what
 * finishing something on its due date means. The same rule keeps this
 * consistent with the overdue flag on rows.
 */
export function punctualityOf(todo: Todo): PunctualityResult | null {
  if (!todo.due || !todo.completedAt) return null
  const completed = new Date(todo.completedAt).getTime()
  if (Number.isNaN(completed)) return null
  const due = dueInstant(todo)
  if (!Number.isFinite(due)) return null

  if (todo.due.kind === 'date') {
    // Whole-day comparison: the todo was due *that day*.
    const dueDay = new Date(due)
    const completedDay = new Date(completed)
    const sameDay =
      dueDay.getFullYear() === completedDay.getFullYear() &&
      dueDay.getMonth() === completedDay.getMonth() &&
      dueDay.getDate() === completedDay.getDate()
    if (sameDay) return { kind: 'onTime', label: 'Completed on time' }
    if (completed < due) {
      const days = Math.max(1, Math.round((due - completed) / DAY))
      return { kind: 'early', label: `Completed ${plural(days, 'day')} early` }
    }
    const days = Math.max(1, Math.round((completed - due) / DAY))
    return { kind: 'late', label: `Completed ${plural(days, 'day')} late` }
  }

  const diff = completed - due
  // Within a few minutes either way is "on time" — a todo finished at
  // 09:01 for a 09:00 deadline was not late in any sense that matters.
  if (Math.abs(diff) < 5 * MINUTE) {
    return { kind: 'onTime', label: 'Completed on time' }
  }
  if (diff < 0) {
    return { kind: 'early', label: `Completed ${roughly(-diff)} early` }
  }
  return { kind: 'late', label: `Completed ${roughly(diff)} late` }
}
