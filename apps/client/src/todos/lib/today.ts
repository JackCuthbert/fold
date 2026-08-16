import type { Todo } from '@fold/schemas'
import { dueInstant } from './sort'
// Shared with Summary so a date buckets identically in both views
// (docs/specs/next-7-days-view.md — grouped by day).
import { localDayOf } from './summary'

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
/** docs/specs/next-7-days-view.md — the week ahead, today included. */
export const NEXT_7_DAYS_VIEW = 'view:next-7-days' as const
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
 *
 * Next 7 days goes at position 3, immediately after Tomorrow, because the
 * day views read as a widening window — the day you are in, the day next,
 * the week around them — and only then what is behind you. It shuffles the
 * two views after it: Summary moves from `Ctrl+Shift+3` to `Ctrl+Shift+4`
 * and Search from `Ctrl+Shift+4` to `Ctrl+Shift+5`.
 *
 * Appending instead, which is what Search did to avoid exactly this, was
 * rejected: Search had no natural place among the day views, so last cost
 * nothing. This one does have a place, and a nav ordered Today, Tomorrow,
 * Summary, Search, Next 7 days would misfile a day view among the things
 * that are not days — permanently, to spare two relearned digits once.
 * That is the same trade Tomorrow took against Summary, and it is settled
 * the same way. *(changed 2026-08-14: Next 7 days inserted at position 3.)*
 */
export const DERIVED_VIEWS = [
  TODAY_VIEW,
  TOMORROW_VIEW,
  NEXT_7_DAYS_VIEW,
  SUMMARY_VIEW,
  SEARCH_VIEW,
] as const

export const isTodayView = (view: ViewId | null): boolean => view === TODAY_VIEW

export const isTomorrowView = (view: ViewId | null): boolean =>
  view === TOMORROW_VIEW

export const isNext7DaysView = (view: ViewId | null): boolean =>
  view === NEXT_7_DAYS_VIEW

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

/** How many days the Next 7 days window spans, today counted as the first. */
export const NEXT_7_DAYS_SPAN = 7

/**
 * Todos still **to do** in the next seven days, across every list
 * (docs/specs/next-7-days-view.md).
 *
 * The window is **today through today+6 inclusive**, so it overlaps Today
 * and Tomorrow rather than starting after them. The question this view
 * answers is "what does my week look like", and a week that begins the day
 * after tomorrow is not a week — it is days three to seven, which is a
 * thing nobody asked for. Overlapping is the honest reading, and it costs
 * nothing: these are different views, never on screen together, so a todo
 * appearing in two of them is not a duplicate the way one appearing twice
 * in a *single* list would be. That is why Today and Tomorrow must stay
 * disjoint from each other and this one need not be disjoint from either —
 * they are adjacent slices, this is the span containing them.
 *
 * **Bounded at both ends**, exactly as Tomorrow is, and for its reason: an
 * overdue todo is today's problem and Today is already showing it. A view
 * of the week ahead that also carried everything you have already failed to
 * do would answer a different question than the one it is named for.
 *
 * **Outstanding work only.** Same rule again — a completed todo belongs to
 * the day it was *done*, which Today shows and Summary files. A forward
 * view is about work that is still coming.
 */
export function selectNextWeek(todos: readonly Todo[], now: Date): Todo[] {
  const windowStart = startOfLocalDay(now)
  const windowEnd = endOfLocalDay(addLocalDays(now, NEXT_7_DAYS_SPAN - 1))
  return todos.filter((todo) => {
    if (todo.completed) return false
    const due = dueInstant(todo)
    return due >= windowStart && due <= windowEnd
  })
}

/** One day's outstanding work. `day` is a local yyyy-mm-dd. */
export interface DueDay {
  day: string
  todos: Todo[]
}

/**
 * Group todos by the local day they are **due**, soonest day first
 * (docs/specs/next-7-days-view.md — grouped by day).
 *
 * The mirror of `summariseCompleted`, and deliberately a separate function
 * rather than a parameterised one. The two differ in every part: which
 * instant buckets a todo (due vs `completedAt`), which direction the days
 * run (forwards vs backwards), and what is excluded (nothing vs undated
 * and beyond-retention, which this has no analogue for). A shared
 * implementation would be three flags deciding all of that, which is
 * harder to read than either half. What *is* shared is the part that
 * matters for consistency — `localDayOf` and `dayLabel`, so a date buckets
 * and reads identically in both views.
 *
 * **Soonest first**, the opposite of Summary. That view reads backwards
 * from now, so most-recent-first is what a standup wants; this one reads
 * forwards, so the nearest deadline leads. Copying Summary's comparator
 * would have silently put next Thursday above tomorrow.
 *
 * Within a day, incoming order is preserved — the caller has already
 * sorted by due instant, and `toSorted` is stable, so a day's rows stay in
 * time order.
 */
export function groupByDueDay(todos: readonly Todo[]): DueDay[] {
  const byDay = new Map<string, Todo[]>()
  for (const todo of todos) {
    const instant = dueInstant(todo)
    // Undated todos resolve to +Infinity and are already excluded by
    // `selectNextWeek`'s upper bound; this guard means the function is
    // safe to call on any list rather than only on that one's output.
    if (!Number.isFinite(instant)) continue
    const day = localDayOf(new Date(instant))
    const bucket = byDay.get(day)
    if (bucket) bucket.push(todo)
    else byDay.set(day, [todo])
  }
  // yyyy-mm-dd compares lexicographically, so this is a date sort —
  // ascending, unlike Summary's.
  return [...byDay.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([day, group]) => ({ day, todos: group }))
}

/**
 * Every day in the Next 7 days window, as `localDayOf` keys, soonest first
 * (docs/specs/next-7-days-view.md — every day is drawn).
 *
 * The **skeleton**, which `groupByDueDay`'s result is layered over: that
 * function buckets work and so yields only days that have some, while this
 * view draws all seven regardless. Kept apart deliberately — Summary shares
 * `groupByDueDay` and must keep omitting days it has no work for, so the
 * "always seven" rule belongs to the view that wants it rather than to the
 * bucketing both views use.
 *
 * Built with `addLocalDays` from the same `NEXT_7_DAYS_SPAN` that
 * `selectNextWeek` bounds with, so the skeleton and the selection cannot
 * drift: a day drawn here is exactly a day a todo can be selected into.
 * Two independent constants would let the view grow an eighth heading
 * nothing could ever land under.
 *
 * *(added 2026-08-14: empty days used to be omitted, and the view was hard
 * to plan against — the shape of the week is what makes "Thursday is clear"
 * readable rather than inferred from an absence.)*
 */
export function weekDays(now: Date): string[] {
  return Array.from({ length: NEXT_7_DAYS_SPAN }, (_, offset) =>
    localDayOf(addLocalDays(now, offset)),
  )
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
