import type { Todo, TodoList, TodosResponse } from '@fold/schemas'
import { useQueryClient } from '@tanstack/react-query'
import { countSummary } from '../lib/count-summary'
import { useCacheVersion } from './use-cache-version'
import { groupTodos } from '../lib/group-by-list'
import { isSearchable, searchTodos } from '../lib/search'
import { selectToday, selectTomorrow } from '../lib/today'

/** Which view the count is describing. */
export type CountedView = 'list' | 'today' | 'tomorrow' | 'summary' | 'search'

/**
 * What each view actually renders, out of every todo it can reach.
 *
 * A lookup rather than a ternary chain: with four views the chain was three
 * levels deep, and the `list` case — the plain one — read as the final
 * fallthrough of a nest about the other three. At module scope so the
 * branches are not rebuilt on every render.
 * *(changed 2026-08-05: Tomorrow would have made it four.)*
 *
 * Two separate bugs came from a view counting more than it draws:
 *
 * - Summary counted every todo in every list, active ones included, so a
 *   view that only ever shows finished work announced "4 todos · 8 done" —
 *   and the 4 were todos it does not display at all.
 * - Today counted its slice but not its *rows*, so three grouped grocery
 *   todos counted three times against a single visible row (that half is
 *   `countableRows`, below).
 *
 * *(fixed 2026-08-05, issue #27.)*
 */
function sliceFor(
  view: CountedView,
  todos: Todo[],
  now: Date,
  query: string,
): Todo[] {
  if (view === 'today') return selectToday(todos, now)
  if (view === 'tomorrow') return selectTomorrow(todos, now)
  if (view === 'summary') return todos.filter((todo) => todo.completed)
  if (view === 'search') return searchTodos(todos, query)
  return todos
}

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
  /** The list being shown, or null on a derived view. */
  listId: string | null
  view: CountedView
  now?: Date
  /** The search query, when `view` is 'search' (docs/specs/search-view.md). */
  query?: string
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

  const query = options.query ?? ''
  // Search says nothing until it has been asked something. "No todos" over
  // an untouched field would answer a question nobody put — and it is not
  // even true, since the todos exist and simply have not been searched.
  // The pane carries the prompt instead (search-pane.tsx).
  //
  // Empty string, **not** `null`: the two mean different things to the
  // header. `null` is "not known yet", which draws a loading skeleton — a
  // grey bar that claims a fetch is in flight when nothing is loading and
  // nothing is going to. `''` is "known, and there is nothing to say", so
  // the line reserves its height and stays blank.
  // *(fixed 2026-08-06: this returned null and the skeleton sat there
  // until the first search.)*
  if (options.view === 'search' && !isSearchable(query)) return ''

  const todos: Todo[] = entries.flatMap((entry) => entry?.todos ?? [])
  // Each view counts what it actually renders, not every todo it could
  // reach — see `sliceFor`.
  const shown = sliceFor(options.view, todos, options.now ?? new Date(), query)
  // Grouping is a display decision, so it belongs to the count the same
  // way it belongs to the Summary day headings: a grouped list is one
  // row and counts once (docs/specs/list-kinds.md). A list view never
  // groups, so its rows are its todos — and neither does search, which
  // draws every match as its own row (docs/specs/search-view.md), so
  // grouping here would under-report the results on screen.
  const ungrouped = options.view === 'list' || options.view === 'search'
  const counted = ungrouped ? shown : countableRows(shown, options.lists)
  // A search that matched nothing says so in the pane, naming the query
  // ("Nothing matched zzqqxx"). "No todos" above that is a second, vaguer
  // statement of the same fact — and a misleading one, since there are
  // todos, just none of them this. Blank rather than `null`, so the line
  // still holds its height and draws no loading skeleton.
  if (options.view === 'search' && counted.length === 0) return ''
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
