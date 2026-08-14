import type { Todo } from '@fold/schemas'
import { retentionCutoff } from './retention'

// docs/specs/summary-view.md — finished work, grouped by the local day it
// was finished.

/** One day's completed work. `day` is a local yyyy-mm-dd. */
export interface CompletedDay {
  day: string
  todos: Todo[]
}

export interface SummaryResult {
  days: CompletedDay[]
  /**
   * Completed todos older than the retention window, so deliberately not
   * shown (docs/specs/summary-view.md — the retention window). Counted so
   * the view can say history continues past its edge rather than implying
   * nothing older was ever done.
   */
  beyondWindow: number
  /**
   * Completed todos carrying no `completedAt`, so they cannot be placed on
   * a day. RFC 5545 does not require COMPLETED alongside
   * STATUS:COMPLETED, so another client may legitimately omit it. Counted
   * rather than guessed at, and surfaced so the view can say the history
   * is incomplete instead of quietly under-reporting.
   */
  undated: number
}

const pad = (value: number): string => String(value).padStart(2, '0')

/**
 * Local yyyy-mm-dd for an instant — not `toISOString`, which would bucket
 * by UTC day and put a 9pm-Melbourne completion on the following day.
 */
export const localDayOf = (instant: Date): string =>
  `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}`

/**
 * Group completed todos by the local day they were completed.
 *
 * Days are ordered most-recent-first, and within a day the most recently
 * completed comes first — a standup reads backwards from now
 * (docs/specs/summary-view.md — ordering).
 */
export function summariseCompleted(
  todos: readonly Todo[],
  cutoff: Date = retentionCutoff(),
): SummaryResult {
  const byDay = new Map<string, Todo[]>()
  let undated = 0
  let beyondWindow = 0

  for (const todo of todos) {
    if (!todo.completed) continue
    if (!todo.completedAt) {
      undated += 1
      continue
    }
    const instant = new Date(todo.completedAt)
    // A malformed stamp is as unplaceable as a missing one.
    if (Number.isNaN(instant.getTime())) {
      undated += 1
      continue
    }
    // Past the window: still on the server, deliberately out of view
    // (docs/specs/summary-view.md — the retention window). Bounding what
    // Summary shows is also what makes "Clear old completed" safe — the
    // two share one cutoff, so the safe action can only ever delete what
    // this view has already stopped showing.
    if (instant.getTime() < cutoff.getTime()) {
      beyondWindow += 1
      continue
    }
    const day = localDayOf(instant)
    const bucket = byDay.get(day)
    if (bucket) bucket.push(todo)
    else byDay.set(day, [todo])
  }

  const days = [...byDay.entries()]
    // yyyy-mm-dd compares lexicographically, so this is a date sort.
    .toSorted(([a], [b]) => b.localeCompare(a))
    .map(([day, group]) => ({
      day,
      todos: group.toSorted((a, b) =>
        (b.completedAt ?? '').localeCompare(a.completedAt ?? ''),
      ),
    }))

  return { days, undated, beyondWindow }
}

/**
 * An instant as day plus time — "Today at 12:00 pm", "3 Aug at 9:15 am".
 * Used by the detail view's metadata footer for both CREATED and COMPLETED
 * (docs/specs/todos.md — metadata).
 *
 * Shares `dayLabel` with the Summary headings so the same moment reads the
 * same way in both places. The time is included here, where the value is
 * about one todo, but not in a heading that covers a whole day.
 */
export function formatTimestamp(timestamp: string, now: Date): string {
  const instant = new Date(timestamp)
  if (Number.isNaN(instant.getTime())) return ''
  const time = instant.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
  return `${dayLabel(localDayOf(instant), now)} at ${time}`
}

/**
 * Human label for a day heading: "Yesterday" / "Today" / "Tomorrow" for the
 * three days around now, an absolute date beyond that. Relative labels are
 * what someone actually says, but only stay honest for a day either side.
 *
 * **It reads in both directions**, which is why "Tomorrow" is here rather
 * than in a forward-looking copy of this function
 * (docs/specs/next-7-days-view.md — grouped by day). Summary reads
 * backwards and Next 7 days reads forwards, but a day heading means the
 * same thing in both, and two functions would let the same date read two
 * ways depending on which view you were in.
 *
 * Adding "Tomorrow" cannot change how a past date reads: the three
 * comparisons are against distinct days, so a day that used to fall through
 * to the absolute branch still does unless it *is* tomorrow — which no
 * completed todo can be, and which `formatTimestamp` only reaches on a
 * skewed clock, where "Tomorrow at 9:00 am" is the honest rendering of a
 * timestamp in the future anyway.
 * *(extended 2026-08-14: was Today/Yesterday only.)*
 */
export function dayLabel(day: string, now: Date): string {
  if (day === localDayOf(now)) return 'Today'
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (day === localDayOf(yesterday)) return 'Yesterday'
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (day === localDayOf(tomorrow)) return 'Tomorrow'

  // Parse as local, not UTC: `new Date('2026-08-01')` is midnight UTC and
  // would render as the previous day west of Greenwich.
  const [year, month, date] = day.split('-').map(Number)
  const local = new Date(year ?? 0, (month ?? 1) - 1, date ?? 1)
  return local.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    // Only name the year when it isn't the current one.
    ...(local.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  })
}
