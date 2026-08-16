import type { Todo, TodoList } from '@fold/schemas'
import { DaySection } from '../day-section/day-section'
import { dayLabel } from '../lib/summary'
import {
  groupByDueDay,
  selectNextWeek,
  sortByDueInstant,
  weekDays,
} from '../lib/today'
import { sortActiveTodos } from '../lib/sort'
import paneStyles from '../todo-pane/todo-pane.module.css'
import { useTodayTodos } from '../hooks/use-today-todos'

// docs/specs/next-7-days-view.md — the week ahead, grouped by the day each
// todo is due.
//
// **Its own pane, not a third `day` on TodayPane.** That is a reversal of
// the call made earlier the same day, and the reason is that the premise
// changed rather than the reasoning being wrong: the argument for sharing
// was that the difference was a *parameter* — a wider window and nothing
// else — and it depended explicitly on having rejected day headings. Design
// review reinstated them, so the premise is gone.
//
// What differs now is structural, not parametric. TodayPane renders one
// flat run of rows with a single page-level health block above it and a
// Completed accordion below. This renders N dated sections, each with its
// own health partition inside it, and has no completed section at all
// (docs/specs/next-7-days-view.md — outstanding work only). Threading that
// through TodayPane would mean three flags deciding whether a health block
// is page-level or per-day, whether days exist, and whether the accordion
// renders — which is the shape the Today-vs-TodoPane split already rejected
// once. *(changed 2026-08-14, after design review.)*
//
// What *is* shared is shared properly rather than copied: `DaySection`
// draws a day for both this view and Summary, and `localDayOf`/`dayLabel`
// come from the Summary module so a date buckets and reads identically
// wherever it appears.
interface NextWeekPaneProps {
  lists: readonly TodoList[]
  // Selection lives in MainScreen — see TodoPane's `onOpen`
  // (docs/specs/ui.md — the detail panel; issue #4).
  onOpen: (todo: Todo, trigger: HTMLElement | null) => void
  /** Go to a list — what a grouped row does (docs/specs/list-kinds.md). */
  onOpenList: (listId: string) => void
}

export function NextWeekPane(props: NextWeekPaneProps) {
  const { todos } = useTodayTodos(props.lists)
  // One instant for the render, so every row and every day boundary is
  // judged against the same "now" rather than drifting as the list is
  // walked.
  const now = new Date()

  // Sorted before grouping, so each day's rows arrive in time order:
  // `sortActiveTodos` first for the app's standard stable tie-break, then
  // by due instant. `groupByDueDay` preserves incoming order within a day,
  // so the sort survives the grouping.
  const due = sortByDueInstant(sortActiveTodos(selectNextWeek(todos, now), now))
  // Soonest day first — this view reads forwards, unlike Summary
  // (lib/today.ts — groupByDueDay).
  //
  // The buckets are then laid over the full seven-day skeleton, so a day
  // with nothing due still gets a heading (docs/specs/next-7-days-view.md —
  // every day is drawn). Ordering comes from `weekDays` rather than from the
  // buckets: it is already the window in order, and taking it from there
  // means the empty days cannot land anywhere but their own place.
  const byDay = new Map(groupByDueDay(due).map((group) => [group.day, group]))
  const days = weekDays(now).map((day) => ({
    day,
    todos: byDay.get(day)?.todos ?? [],
  }))

  return (
    <div className={paneStyles['pane']}>
      {/* docs/specs/next-7-days-view.md — no "Add a todo" row here. The
          title, the count line and the badge beside the title already say
          what this view gathers.

          **Every day in the window is drawn**, empty ones included, each
          carrying "Clear" under its heading. The spec originally argued the
          opposite — that a quiet week would be mostly empty headings, "a
          screen of chrome reporting nothing" — and using the view settled
          it the other way: the shape of the week is the thing you plan
          against, and an absent heading makes "Thursday is clear" something
          you infer rather than read. *(changed 2026-08-14.)* */}
      {days.map((group) => (
        <DaySection
          key={group.day}
          label={dayLabel(group.day, now)}
          todos={group.todos}
          lists={props.lists}
          now={now}
          // docs/specs/list-kinds.md — health leads, and here it keeps a
          // heading of its own *within* the day rather than only sorting
          // first. This work is still outstanding, so Today's
          // "impossible to leave unseen" argument applies; Summary, whose
          // rows are already done, takes the heart instead.
          healthHeading="Health"
          // "Clear", not "Nothing due". Both are true; this one reads as a
          // day off rather than as an absence, which is half of what the
          // skeleton is for — seeing the free days, not just the full ones.
          emptyLabel="Clear"
          onOpen={props.onOpen}
          onOpenList={props.onOpenList}
        />
      ))}
    </div>
  )
}
