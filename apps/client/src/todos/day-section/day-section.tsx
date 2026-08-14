import type { Todo, TodoList } from '@fold/schemas'
import { groupTodos, isHealthTodo, partitionHealth } from '../lib/group-by-list'
import { GroupRow } from '../group-row/group-row'
import { rowListFor } from '../lib/row-list'
import styles from './day-section.module.css'
import { TodayRow } from '../today-pane/today-pane'
import paneStyles from '../todo-pane/todo-pane.module.css'

/**
 * One day's rows under a dated heading.
 *
 * Shared by Summary (docs/specs/summary-view.md) and Next 7 days
 * (docs/specs/next-7-days-view.md), which draw the same shape in opposite
 * directions — one reads backwards over finished work, the other forwards
 * over outstanding work, but a *day* looks identical in both.
 *
 * Extracted rather than copied *(2026-08-14, when Next 7 days gained day
 * grouping)*. Three things had to stay in step across the two panes and
 * would have been copy-paste otherwise: the heading's leading inset, which
 * is a non-obvious calculation reproducing the row's own checkbox offset
 * (day-section.module.css — `.dayHeading`); the rule that the count counts
 * *rows*, so a grouped grocery list contributes 1; and health leading
 * within the day. That last one is the reason this is a component rather
 * than a stylesheet: it is behaviour, not decoration.
 *
 * It is a component with its own directory, per CLAUDE.md — and it has two
 * consumers, which is what earns the extraction. No barrel: `todos` has
 * none, so both panes import this path directly.
 *
 * **The two views differ in exactly one thing, and it is deliberate.**
 * Next 7 days shows a *Health* / *Everything else* subheading pair inside
 * each day; Summary shows neither and marks health rows with a heart
 * instead. Both follow from the same rule
 * (docs/specs/list-kinds.md — health first) applied to opposite material:
 * this view's health work is still outstanding, so Today's
 * "impossible to leave unseen" argument holds per day, while Summary's is
 * already done and needs no chasing — there the heart alone carries the
 * category. Reconciled in docs/specs/next-7-days-view.md so the difference
 * is not later "fixed" into a false consistency.
 */
interface DaySectionProps {
  /** Heading text — a `dayLabel` result, not a raw yyyy-mm-dd. */
  label: string
  todos: readonly Todo[]
  lists: readonly TodoList[]
  /** Judged against one instant per render, passed down to each row. */
  now: Date
  /**
   * Mark health rows with a heart.
   *
   * True in Summary, where nothing else says a row is health — the day
   * heading names a date, not a category (docs/specs/list-kinds.md — a
   * heart, but only where there is no heading).
   *
   * False in Next 7 days, whose health rows sit under a *Health* subheading
   * that already names them. *(added 2026-08-14.)*
   */
  heartHealth?: boolean
  /** Rendered above the health rows, when there are any. */
  healthHeading?: string
  /**
   * What to draw when the day has no todos at all.
   *
   * Only Next 7 days passes it, because only that view draws days it has no
   * work for (docs/specs/next-7-days-view.md — every day is drawn). Summary
   * builds its days *from* completed work, so a day with none never reaches
   * this component and the prop would be unreachable there.
   * *(added 2026-08-14.)*
   */
  emptyLabel?: string
  onOpen: (todo: Todo, trigger: HTMLElement | null) => void
  /** Go to a list — what a grouped row does (docs/specs/list-kinds.md). */
  onOpenList: (listId: string) => void
}

export function DaySection(props: DaySectionProps) {
  // docs/specs/list-kinds.md — health leads, here *within its day*. Both
  // views are read by date, so lifting a health todo out of its day and up
  // the page would file it under the wrong heading. Summary settled this on
  // 2026-08-05; Next 7 days inherits the reasoning rather than Today's
  // page-level block. *(shared 2026-08-14.)*
  const { health, rest } = partitionHealth(props.todos, props.lists)
  const healthRows = groupTodos(health, props.lists)
  const restRows = groupTodos(rest, props.lists)
  // docs/specs/list-kinds.md — the count counts *rows*, so a grouped list
  // contributes 1. Counting the todos behind the group instead put "10"
  // above three visible rows, and a number that disagrees with what is on
  // screen is worse than one that undersells the day.
  // *(changed 2026-08-05: was a count of todos.)*
  const count = healthRows.length + restRows.length
  // Subheadings only where the caller wants them *and* the day actually has
  // both kinds of work.
  //
  // docs/specs/list-kinds.md states this rule for "Everything else": it
  // appears only when there is a health section above it, since with
  // nothing to be distinguished from it would label the only thing on
  // screen. **The converse holds too**, which only became visible once the
  // headings nested inside days: a lone "Health" over a day's single row,
  // with no "Everything else" to pair with, is the same orphan in the other
  // direction. Seen rendered, it read as noise rather than as structure.
  //
  // So the pair is all-or-nothing per day. A day with only health work, or
  // only ordinary work, is one uninterrupted run of rows under its date —
  // and that is the common case, since most days have no health todo.
  // *(added 2026-08-14, after looking at it: the first cut showed a bare
  // "Health" heading on two of seven days.)*
  const showSubheadings =
    props.healthHeading !== undefined &&
    healthRows.length > 0 &&
    restRows.length > 0

  const rowList = (listId: string) => rowListFor(props.lists, listId)

  const renderRows = (rows: ReturnType<typeof groupTodos>) =>
    rows.map((row) =>
      row.kind === 'group' ? (
        <GroupRow
          key={`group:${row.listId}`}
          group={row}
          onOpenList={props.onOpenList}
        />
      ) : (
        <TodayRow
          key={row.todo.uid}
          todo={row.todo}
          now={props.now}
          list={rowList(row.todo.listId)}
          {...(props.heartHealth && isHealthTodo(row.todo, props.lists)
            ? { health: true }
            : {})}
          onOpen={(trigger) => props.onOpen(row.todo, trigger)}
        />
      ),
    )

  return (
    <section className={styles['day']}>
      {/* A heading per day rather than a divider: both views are read by
          scanning for a date, so the date must be the loudest thing on the
          row (docs/specs/summary-view.md). */}
      <h2 className={styles['dayHeading']}>
        {props.label}
        {/* No "0". The empty line below already says the day is clear, and a
            zero beside the date says it a second time in a quieter voice —
            two marks for one fact, on the days that should be the quietest
            things in the view. A count earns its place by distinguishing 1
            from 7; there is nothing to distinguish at none.
            *(added 2026-08-14, once empty days were drawn at all.)* */}
        {count > 0 && <span className={styles['dayCount']}>{count}</span>}
      </h2>
      {count === 0 && props.emptyLabel !== undefined ? (
        // A day with nothing due. One quiet line rather than an empty
        // <ul>, so the heading has something under it and the week's shape
        // reads as deliberate rather than as a rendering gap.
        //
        // Not a row: it has no checkbox column and nothing to open, so
        // giving it a row's geometry would invite a click it does not
        // answer. It sits on the same left edge as the rows in the days
        // around it (docs/specs/ui.md — one left edge).
        <p className={styles['empty']}>{props.emptyLabel}</p>
      ) : showSubheadings ? (
        // docs/specs/list-kinds.md — health leads, under a heading of its
        // own, with the ordinary rows under a peer heading below. Both or
        // neither: see `showSubheadings` above.
        <>
          <h3 className={styles['sectionHeading']}>{props.healthHeading}</h3>
          <ul className={paneStyles['list']}>{renderRows(healthRows)}</ul>
          <h3 className={styles['sectionHeading']}>Everything else</h3>
          <ul className={paneStyles['list']}>{renderRows(restRows)}</ul>
        </>
      ) : (
        // One uninterrupted run, health simply first — Summary's treatment
        // always, and this view's on a day that has only one kind of work.
        <ul className={paneStyles['list']}>
          {renderRows([...healthRows, ...restRows])}
        </ul>
      )}
    </section>
  )
}
