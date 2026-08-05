import type { Todo, TodoList, TodosResponse } from '@fold/schemas'
import { useQueryClient } from '@tanstack/react-query'
import { countSummary } from './count-summary'
import { useCacheVersion } from './use-cache-version'
import { groupTodos } from './group-by-list'
import { selectToday } from './today'

/**
 * The count line for whichever view is showing.
 *
 * Reads the **same** `['todos', listId]` entries the panes populate, and
 * never fetches: it is a subscriber to the query cache, not a query of its
 * own. So the line costs no request, and a list view stays a single-list
 * fetch — the count must never be the reason the app fans out across every
 * list, which is what keeps it free against a slow server (issue #24).
 *
 * Deliberately **not** `useQueries` with `enabled: false`. That was the
 * first design and it caused three separate bugs, all from the same root:
 * a disabled observer's status flags describe a query that never runs, so
 * `isFetching` is permanently false and `isSuccess` never becomes true on
 * its own. Neither could distinguish "not loaded yet" from "loaded and
 * empty" — the one distinction this hook exists to make. Subscribing to
 * the cache asks the only question with a reliable answer: is there an
 * entry for this key? *(rewritten 2026-08-04.)*
 */
export function useViewCount(options: {
  lists: readonly TodoList[]
  /**
   * Whether `lists` is known yet. On a cold load the lists arrive *after*
   * first paint, so an empty array means "not loaded" as often as it means
   * "no lists" — without this the header announced "No todos" for several
   * frames on every load before correcting itself.
   */
  listsLoaded: boolean
  /** The list being shown, or null on Today/Summary. */
  listId: string | null
  view: 'list' | 'today' | 'summary'
  now?: Date
}): string | null {
  const queryClient = useQueryClient()

  // A list view watches only its own list; the derived views watch all of
  // them, matching what each already fetches.
  const watched =
    options.view === 'list'
      ? options.lists.filter((list) => list.id === options.listId)
      : options.lists
  const keys = watched.map((list) => list.id)

  // Re-render whenever any todos entry changes, so the line falls the
  // moment a todo is ticked. Shared with useListActiveTodos — see
  // use-cache-version.ts, which explains why the counter and its filter
  // must be common to both.
  useCacheVersion()

  const entries = keys.map((id) =>
    queryClient.getQueryData<TodosResponse>(['todos', id]),
  )
  // "Known" means the pane that owns this key has put a response in the
  // cache — even an empty one. An absent entry is a list whose todos have
  // genuinely not been fetched yet.
  const anyKnown = entries.some((entry) => entry !== undefined)
  const pending = !options.listsLoaded || (keys.length > 0 && !anyKnown)

  const todos: Todo[] = entries.flatMap((entry) => entry?.todos ?? [])
  // Each view counts what it actually renders, not every todo it could
  // reach. Two separate bugs came from skipping this:
  //
  // - Summary counted every todo in every list, active ones included, so
  //   a view that only ever shows finished work announced "4 todos ·
  //   8 done" — and the 4 were todos it does not display at all. It
  //   shows completed todos, so that is what it counts.
  // - Today counted its slice but not its *rows*, so three grouped
  //   grocery todos counted three times against a single visible row.
  //
  // *(fixed 2026-08-05, issue #27.)*
  const shown =
    options.view === 'today'
      ? selectToday(todos, options.now ?? new Date())
      : options.view === 'summary'
        ? todos.filter((todo) => todo.completed)
        : todos
  // Grouping is a display decision, so it belongs to the count the same
  // way it belongs to the Summary day headings: a grouped list is one
  // row and counts once (docs/specs/list-kinds.md). A list view never
  // groups, so its rows are its todos.
  const counted =
    options.view === 'list' ? shown : countableRows(shown, options.lists)
  return countSummary(counted, { pending })
}

/**
 * One representative todo per rendered row.
 *
 * A grouped list contributes a single entry, so the header agrees with
 * what is on screen.
 *
 * **Grouped per half, because that is how the panes draw it.** Today
 * renders its outstanding rows and its Completed section as two separate
 * lists, each grouped on its own (today-pane.tsx), so a grocery list with
 * both outstanding and finished items shows *two* group rows — one above,
 * one in the accordion. Grouping the whole slice in one pass collapsed
 * them into a single row and lost the completed one from the count
 * entirely: four groceries, two of them done, counted "1 todo" against
 * two visible rows.
 * *(fixed 2026-08-05: was one pass over everything.)*
 */
export function countableRows(
  todos: readonly Todo[],
  lists: readonly TodoList[],
): Todo[] {
  const half = (subset: readonly Todo[]): Todo[] =>
    groupTodos(subset, lists).map((row) =>
      // A group is only finished when every todo in it is
      // (group-row.tsx). Splitting first means each half is already
      // uniform, so the representative simply comes from it.
      row.kind === 'todo' ? row.todo : row.todos[0]!,
    )
  return [
    ...half(todos.filter((todo) => !todo.completed)),
    ...half(todos.filter((todo) => todo.completed)),
  ]
}
