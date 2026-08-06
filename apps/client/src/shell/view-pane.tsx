import type { Todo, TodoList } from '@fold/schemas'
import { SearchPane } from '../todos/search-pane'
import { SummaryPane } from '../todos/summary-pane'
import { TodayPane } from '../todos/today-pane'
import { TodoPane } from '../todos/todo-pane'
import type { useAddTodo } from '../todos/use-add-todo'
import styles from './main-screen.module.css'

/** Which pane the selected view resolves to. */
export type PaneKind = 'today' | 'tomorrow' | 'summary' | 'search' | 'list'

/**
 * The pane for whichever view is selected.
 *
 * Extracted from MainScreen (issue #28): a five-branch ternary chain in the
 * middle of the layout, which is exactly the shape that gets harder to read
 * with every view added — and one has been added three times now (Tomorrow,
 * then Search).
 *
 * Each pane is **keyed by the view id**, so switching remounts it and
 * replays its fade-in (todo-pane.module.css — `.pane`). Without the key
 * React reuses the same element and the animation only ever runs once, on
 * first render. It is also what keeps Today and Tomorrow from sharing
 * state, since they are one component given a different day.
 */
export function ViewPane(props: {
  kind: PaneKind
  /** The view id, used as the remount key. */
  activeView: string
  /**
   * The lists this view may draw from — already narrowed by the list
   * filter for a derived view, and the full set for a list view
   * (docs/specs/list-filter.md).
   */
  lists: readonly TodoList[]
  activeList: TodoList | undefined
  add: ReturnType<typeof useAddTodo>
  searchQuery: string
  onSearchQueryChange: (query: string) => void
  onOpen: (todo: Todo, trigger: HTMLElement | null) => void
  onOpenList: (listId: string) => void
}) {
  // Today and Tomorrow are one pane over a different day window
  // (docs/specs/tomorrow-view.md).
  if (props.kind === 'today' || props.kind === 'tomorrow') {
    return (
      <TodayPane
        key={props.activeView}
        lists={props.lists}
        {...(props.kind === 'tomorrow' ? { day: 'tomorrow' as const } : {})}
        onOpen={props.onOpen}
        onOpenList={props.onOpenList}
      />
    )
  }

  if (props.kind === 'summary') {
    return (
      <SummaryPane
        key={props.activeView}
        lists={props.lists}
        onOpen={props.onOpen}
        onOpenList={props.onOpenList}
      />
    )
  }

  if (props.kind === 'search') {
    // No `onOpenList`: search never groups, so it has no group row to
    // click through (search-pane.tsx).
    return (
      <SearchPane
        key={props.activeView}
        lists={props.lists}
        query={props.searchQuery}
        onQueryChange={props.onSearchQueryChange}
        onOpen={props.onOpen}
      />
    )
  }

  if (props.activeList) {
    return (
      <TodoPane
        key={props.activeView}
        listId={props.activeList.id}
        add={props.add}
        onOpen={props.onOpen}
      />
    )
  }

  return <p className={styles['empty']}>Create a list to get started.</p>
}
