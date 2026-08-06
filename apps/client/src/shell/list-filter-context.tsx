import type { TodoList } from '@fold/schemas'
import { createContext, use, type ReactNode } from 'react'
import type { ListFilter } from '../lists/list-filter/list-filter'

export interface ListFilterState {
  /** Which lists are hidden, or null when nothing is. */
  filter: ListFilter
  /** Every list the server knows about, hidden ones included. */
  allLists: TodoList[]
  /**
   * The lists the current view may draw from.
   *
   * Narrowed by the filter for a derived view; the full set in a list
   * view, since you asked for that list by name
   * (docs/specs/list-filter.md).
   */
  shownLists: TodoList[]
  /** Hide or unhide one list. */
  toggle: (listId: string) => void
  /** Unhide everything. */
  clear: () => void
  /** How many lists the filter is currently hiding. */
  hiddenCount: number
}

const ListFilterContext = createContext<ListFilterState | null>(null)

/**
 * The hidden-list filter — docs/specs/list-filter.md.
 *
 * A context because the filter is read in three places that have nothing
 * else in common: the nav (which rows to draw, and the "N lists hidden"
 * row), the panes (which lists a derived view aggregates), and the reveal
 * confirmation. `allLists` and `shownLists` travel with it because the
 * distinction between them *is* the filter — separating them would let a
 * caller pass the wrong one, which is precisely the bug this feature
 * cannot have.
 *
 * *(added 2026-08-06, issue #28.)*
 */
export function ListFilterProvider(props: {
  value: ListFilterState
  children: ReactNode
}) {
  return (
    <ListFilterContext value={props.value}>{props.children}</ListFilterContext>
  )
}

export function useListFilter(): ListFilterState {
  const value = use(ListFilterContext)
  if (!value) throw new Error('useListFilter outside ListFilterProvider')
  return value
}
