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
/** docs/specs/summary-view.md — finished work, grouped by day. */
export const SUMMARY_VIEW = 'view:summary' as const
export type ViewId = string

/**
 * Every derived view, in the order the nav shows them.
 *
 * One ordered list rather than a set of loose constants, because the order
 * is load-bearing: `Ctrl+Shift+<n>` jumps to the nth view
 * (docs/specs/ui.md — keyboard shortcuts), so adding a view here gives it
 * a chord for free, and *where* it goes decides which digit it takes.
 *
 * That is deliberate. Real lists are numbered by nothing — they come and
 * go, and a chord that silently changes meaning when a list is created is
 * worse than no chord (they are reachable by name from the command
 * palette instead, issue #26). Derived views are a small, fixed set that
 * only changes when someone decides to add one, so a position here is a
 * decision rather than an accident.
 *
 * *(added 2026-08-04.)*
 */
export const DERIVED_VIEWS = [TODAY_VIEW, SUMMARY_VIEW] as const

export const isTodayView = (view: ViewId | null): boolean => view === TODAY_VIEW

export const isSummaryView = (view: ViewId | null): boolean =>
  view === SUMMARY_VIEW

/** True for any derived view — i.e. anything that is not a real list. */
export const isDerivedView = (view: ViewId | null): boolean =>
  DERIVED_VIEWS.some((id) => id === view)

/** Last millisecond of `now`'s local day — the cutoff for "due today". */
export function endOfLocalDay(now: Date): number {
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  return end.getTime()
}

/** First millisecond of `now`'s local day. */
export function startOfLocalDay(now: Date): number {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  return start.getTime()
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
 *
 * **Completed todos are bounded at both ends**, unlike active ones. The
 * open-ended lower bound exists so missed work stays visible; applied to
 * finished work it did the opposite, accumulating every todo ever
 * completed on any past day into today's "Completed" section, which is
 * meant to be one day's slice. A finished todo needs no chasing, so
 * there is nothing to keep visible.
 *
 * "Today" for a completed todo means finished today *or* due today —
 * `completedAt` is the truer signal but is optional (another client may
 * omit COMPLETED), so the due date is the fallback that keeps such a todo
 * from disappearing entirely.
 * *(fixed 2026-08-05: completed todos from previous days leaked in.)*
 */
export function selectToday(todos: readonly Todo[], now: Date): Todo[] {
  const cutoff = endOfLocalDay(now)
  const dayStart = startOfLocalDay(now)
  return todos.filter((todo) => {
    const due = dueInstant(todo)
    if (!todo.completed) return due <= cutoff
    if (todo.completedAt) {
      const finished = new Date(todo.completedAt).getTime()
      return finished >= dayStart && finished <= cutoff
    }
    return due >= dayStart && due <= cutoff
  })
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
