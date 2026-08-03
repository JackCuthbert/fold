import type { Todo } from '@fold/schemas'

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
export function summariseCompleted(todos: readonly Todo[]): SummaryResult {
  const byDay = new Map<string, Todo[]>()
  let undated = 0

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

  return { days, undated }
}

/**
 * Human label for a day heading: "Today" / "Yesterday" for the two most
 * recent, an absolute date beyond that. Relative labels are what someone
 * preparing a standup actually says, but only stay honest for a day or two.
 */
export function dayLabel(day: string, now: Date): string {
  if (day === localDayOf(now)) return 'Today'
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (day === localDayOf(yesterday)) return 'Yesterday'

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
