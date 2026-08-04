import type { Todo, TodoList, TodosResponse } from '@fold/schemas'
import { useQueries } from '@tanstack/react-query'
import { countSummary } from './count-summary'
import { selectToday } from './today'

/**
 * The count line for whichever view is showing.
 *
 * Reads the **same** `['todos', listId]` queries the panes populate, with
 * no `queryFn` of its own — so it never triggers a fetch. It observes what
 * the visible pane has already loaded and re-renders when that changes.
 * `useQueries` subscribes reactively, which a bare `getQueryData` read
 * would not: the line has to fall the moment a todo is ticked.
 *
 * The cost profile is deliberately identical to the view it labels. A list
 * view watches one list; Today and Summary watch every list, which they
 * were already fetching anyway (use-today-todos.ts). Nothing here makes a
 * list view fan out across lists — that is what kept this feature free
 * against a slow server (issue #24 is the standing reason to care).
 */
export function useViewCount(options: {
  lists: readonly TodoList[]
  /** The list being shown, or null on Today/Summary. */
  listId: string | null
  view: 'list' | 'today' | 'summary'
  now?: Date
}): string | null {
  // A list view watches only its own list; the derived views watch all of
  // them, matching what each already fetches.
  const watched =
    options.view === 'list'
      ? options.lists.filter((list) => list.id === options.listId)
      : options.lists

  return useQueries({
    queries: watched.map((list) => ({
      queryKey: ['todos', list.id],
      // `enabled: false` makes this a read-only observer of the query the
      // visible pane owns, so the header can never cost a request the view
      // wasn't already making.
      //
      // The queryFn is unreachable for that reason, and exists to declare
      // the shape the real fetchers return (todo-pane.tsx,
      // use-today-todos.ts) — which is otherwise uninferrable here, and
      // would mean asserting over the result instead. It throws rather
      // than returning a plausible empty value so that if `enabled` ever
      // became true this fails loudly instead of quietly reporting an
      // empty view.
      enabled: false,
      queryFn: (): Promise<TodosResponse> => {
        throw new Error('useViewCount observes only; it must never fetch')
      },
    })),
    combine: (results) => {
      // Silence until the todos are *known* — claiming "No todos" before
      // they land would state the opposite of what is about to appear.
      //
      // Keyed on fetch status, not on `data === undefined`: a genuinely
      // empty list settles with `data.todos === []`, but a brand-new list
      // sits at `undefined` for a moment first. Treating undefined as
      // "still loading" left a real empty list with no line at all, since
      // nothing ever arrives to make it stop waiting. `isFetching` is the
      // honest question — is a request in flight — and an idle query with
      // no data is a list we know to be empty.
      const pending =
        results.length > 0 &&
        results.every(
          (result) => result.data === undefined && result.isFetching,
        )
      const todos: Todo[] = results.flatMap(
        (result) => result.data?.todos ?? [],
      )
      // Today counts its own slice, not every todo in every list — the
      // line has to describe what the view actually shows
      // (docs/specs/today-view.md).
      const shown =
        options.view === 'today'
          ? selectToday(todos, options.now ?? new Date())
          : todos
      return countSummary(shown, { pending })
    },
  })
}
