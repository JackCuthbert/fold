import type { Todo } from '@fold/schemas'
import { dueInstant } from './sort'

// docs/specs/today-view.md — a derived view, not a collection. The sentinel
// stands in for a list id wherever a selection is held, so "which view is
// open" stays a single value rather than a parallel boolean.
//
// The `view:` prefix is what makes that safe. List ids are collection href
// path segments (tsdav-gateway.ts — `listIdFromHref`), and a bare word like
// 'today' is a perfectly ordinary collection name: the author's own server
// has a list whose id is exactly that, which an unprefixed sentinel would
// have shadowed. A colon cannot appear unescaped in a path segment, so this
// value can never collide with a real list id.
export const TODAY_VIEW = 'view:today' as const
export type ViewId = string

export const isTodayView = (view: ViewId | null): boolean => view === TODAY_VIEW

/** Last millisecond of `now`'s local day — the cutoff for "due today". */
export function endOfLocalDay(now: Date): number {
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  return end.getTime()
}

/**
 * Todos due today or already overdue, across every list
 * (docs/specs/today-view.md).
 *
 * Overdue items are included deliberately: dropping them would make a
 * missed todo vanish from Today the next day, findable only by opening its
 * own list. There is no lower bound for that reason — anything still
 * incomplete and past due belongs here.
 *
 * A todo with no due date resolves to +Infinity via `dueInstant` and so is
 * naturally excluded by the upper bound.
 */
export function selectToday(todos: readonly Todo[], now: Date): Todo[] {
  const cutoff = endOfLocalDay(now)
  return todos.filter((todo) => dueInstant(todo) <= cutoff)
}

/**
 * Order for the Today view: by resolved due instant, soonest first
 * (docs/specs/today-view.md — ordering), so overdue items lead.
 *
 * Ties fall back to the caller's existing order, which
 * `sortActiveTodos` has already made stable — this sort is applied on top
 * of it, and `toSorted` is specified as stable.
 */
export function sortByDueInstant(todos: readonly Todo[]): Todo[] {
  return todos.toSorted((a, b) => dueInstant(a) - dueInstant(b))
}
