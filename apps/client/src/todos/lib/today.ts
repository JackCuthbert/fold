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
/** docs/specs/tomorrow-view.md — what is coming, one day ahead. */
export const TOMORROW_VIEW = 'view:tomorrow' as const
/** docs/specs/summary-view.md — finished work, grouped by day. */
export const SUMMARY_VIEW = 'view:summary' as const
/** docs/specs/search-view.md — fuzzy text search over everything. */
export const SEARCH_VIEW = 'view:search' as const
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
 *
 * Tomorrow sits between Today and Summary because that is the order the
 * three read in — the day you are in, the day next, then what is behind
 * you. It cost Summary its chord: inserting here moved it from
 * `Ctrl+Shift+2` to `Ctrl+Shift+3`. Taken deliberately, and only because
 * the alternative is permanent — a nav ordered Today, Summary, Tomorrow
 * would look wrong every day from now on to spare one relearned digit
 * once. *(changed 2026-08-05: Tomorrow inserted at position 2.)*
 *
 * Search goes last, and *appending* is the point: it takes `Ctrl+Shift+4`
 * and leaves all three existing chords exactly where they are. Inserting it
 * anywhere else would have shuffled digits again for a view that has no
 * natural place among the other three — those are days, read in order,
 * while search is a different kind of thing entirely. Last is also where it
 * belongs by use: the day views are what you open by habit, search is what
 * you reach for when they have not got what you want.
 * *(changed 2026-08-06, issue #6: Search appended at position 4.)*
 */
export const DERIVED_VIEWS = [
  TODAY_VIEW,
  TOMORROW_VIEW,
  SUMMARY_VIEW,
  SEARCH_VIEW,
] as const

export const isTodayView = (view: ViewId | null): boolean => view === TODAY_VIEW

export const isTomorrowView = (view: ViewId | null): boolean =>
  view === TOMORROW_VIEW

export const isSummaryView = (view: ViewId | null): boolean =>
  view === SUMMARY_VIEW

export const isSearchView = (view: ViewId | null): boolean =>
  view === SEARCH_VIEW

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
 * The same date, `days` later — by calendar day, not by adding 24 hours.
 *
 * `setDate` is what makes it calendar arithmetic: it rolls the month and
 * year, and it lands on the same wall-clock time across a daylight-saving
 * boundary, where `+86_400_000` would land an hour out and put a midnight
 * todo on the wrong side of the day boundary twice a year.
 * *(added 2026-08-05.)*
 */
export function addLocalDays(now: Date, days: number): Date {
  const shifted = new Date(now)
  shifted.setDate(shifted.getDate() + days)
  return shifted
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
 * Todos still **to do** tomorrow, across every list
 * (docs/specs/tomorrow-view.md).
 *
 * Two rules, and both are narrowings of Today's:
 *
 * **Bounded at both ends.** Today's open-ended lower bound exists so
 * missed work keeps following you until it is dealt with. Tomorrow has
 * nothing to chase: an overdue todo is not tomorrow's problem, it is
 * today's, and Today is already showing it. Letting overdue items leak in
 * would make the two views near-copies of each other and turn the one
 * question Tomorrow answers — "what is coming?" — into "what is coming,
 * plus everything I have already failed to do".
 *
 * **Outstanding work only.** A completed todo belongs to the day it was
 * *completed*, not the day it was due — which is already how Today selects
 * (`completedAt`) and exactly how Summary groups. So ticking tomorrow's
 * work off early moves it to Today, under Completed, and it lands on the
 * real day in Summary.
 *
 * The row does vanish from Tomorrow on the click, and that is correct
 * rather than a glitch: it is no longer something to do tomorrow. The
 * first draft kept such todos here to avoid the disappearance, which cost
 * a special case in this function *and* made Tomorrow the one view whose
 * completed section could contradict Summary about which day the work
 * happened on. Deleting the carve-out is what makes the day rule uniform.
 * *(simplified 2026-08-05: was "finished today or later and due
 * tomorrow".)*
 */
export function selectTomorrow(todos: readonly Todo[], now: Date): Todo[] {
  const tomorrow = addLocalDays(now, 1)
  const dayStart = startOfLocalDay(tomorrow)
  const dayEnd = endOfLocalDay(tomorrow)
  return todos.filter((todo) => {
    if (todo.completed) return false
    const due = dueInstant(todo)
    return due >= dayStart && due <= dayEnd
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
