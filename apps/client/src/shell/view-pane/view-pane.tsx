import type { TodoList } from '@fold/schemas'
import { NextWeekPane } from '../../todos/next-week-pane/next-week-pane'
import { SearchPane } from '../../todos/search-pane/search-pane'
import { SummaryPane } from '../../todos/summary-pane/summary-pane'
import { TodayPane } from '../../todos/today-pane/today-pane'
import { TodoPane } from '../../todos/todo-pane/todo-pane'
import type { useAddTodo } from '../../todos/hooks/use-add-todo'
import { useListFilter } from '../context/list-filter-context'
import { useSelection } from '../context/selection-context'
import styles from '../main-screen/main-screen.module.css'

/** Which pane the selected view resolves to. */
export type PaneKind =
  | 'today'
  | 'tomorrow'
  | 'next-7-days'
  | 'summary'
  | 'search'
  | 'list'

/**
 * The pane for whichever view is selected.
 *
 * Extracted from MainScreen (issue #28): a five-branch ternary chain in the
 * middle of the layout, which is exactly the shape that gets harder to read
 * with every view added — and one has been added three times now (Tomorrow,
 * then Search, then Next 7 days).
 *
 * Each pane is **keyed by the view id**, so switching remounts it and
 * replays its fade-in (todo-pane.module.css — `.pane`). Without the key
 * React reuses the same element and the animation only ever runs once, on
 * first render. It is also what keeps Today and Tomorrow from sharing
 * state, since they are one component given a different day.
 */
interface ViewPaneProps {
  kind: PaneKind
  activeList: TodoList | undefined
  add: ReturnType<typeof useAddTodo>
  searchQuery: string
  onSearchQueryChange: (query: string) => void
}

export function ViewPane(props: ViewPaneProps) {
  const selection = useSelection()
  // Already narrowed by the filter for a derived view, and the full set in
  // a list view — the distinction is `shownLists`' whole job
  // (list-filter-context.tsx).
  const { shownLists } = useListFilter()
  // Today and Tomorrow are one pane over a different day window
  // (docs/specs/tomorrow-view.md).
  if (props.kind === 'today' || props.kind === 'tomorrow') {
    return (
      <TodayPane
        key={selection.active}
        lists={shownLists}
        {...(props.kind === 'tomorrow' ? { day: 'tomorrow' as const } : {})}
        onOpen={selection.openDetail}
        onOpenList={selection.select}
      />
    )
  }

  // Next 7 days has its own pane: it groups by day and partitions health
  // *inside* each day, which is structure the flat panes above do not have
  // (docs/specs/next-7-days-view.md — its own pane).
  if (props.kind === 'next-7-days') {
    return (
      <NextWeekPane
        key={selection.active}
        lists={shownLists}
        onOpen={selection.openDetail}
        onOpenList={selection.select}
      />
    )
  }

  if (props.kind === 'summary') {
    return (
      <SummaryPane
        key={selection.active}
        lists={shownLists}
        onOpen={selection.openDetail}
        onOpenList={selection.select}
      />
    )
  }

  if (props.kind === 'search') {
    // No `onOpenList`: search never groups, so it has no group row to
    // click through (search-pane.tsx).
    return (
      <SearchPane
        key={selection.active}
        lists={shownLists}
        query={props.searchQuery}
        onQueryChange={props.onSearchQueryChange}
        onOpen={selection.openDetail}
      />
    )
  }

  if (props.activeList) {
    return (
      <TodoPane
        key={selection.active}
        listId={props.activeList.id}
        add={props.add}
        onOpen={selection.openDetail}
      />
    )
  }

  return <p className={styles['empty']}>Create a list to get started.</p>
}
