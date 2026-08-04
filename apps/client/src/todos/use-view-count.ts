import type { Todo, TodoList, TodosResponse } from '@fold/schemas'
import { useQueryClient } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { countSummary } from './count-summary'
import { selectToday } from './today'

// Bumped on every query-cache event. Module scope so the subscription can
// write to it without a ref, and shared harmlessly: its only job is to be
// a value that changed since the last render.
let cacheVersion = 0

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
  // moment a todo is ticked.
  //
  // The snapshot is a counter bumped on every cache event rather than
  // anything derived from the data: `useSyncExternalStore` compares
  // snapshots by `Object.is`, so returning a fresh array or object would
  // loop forever, and returning something stable like `getAll().length`
  // would miss the case this exists for — a query's *data* changing while
  // the number of queries does not.
  // The counter is bumped by the *subscription*, never by the read —
  // `getSnapshot` must be pure, or React re-renders forever.
  useSyncExternalStore(
    (onChange) =>
      queryClient.getQueryCache().subscribe(() => {
        cacheVersion += 1
        onChange()
      }),
    () => cacheVersion,
  )

  const entries = keys.map((id) =>
    queryClient.getQueryData<TodosResponse>(['todos', id]),
  )
  // "Known" means the pane that owns this key has put a response in the
  // cache — even an empty one. An absent entry is a list whose todos have
  // genuinely not been fetched yet.
  const anyKnown = entries.some((entry) => entry !== undefined)
  const pending = !options.listsLoaded || (keys.length > 0 && !anyKnown)

  const todos: Todo[] = entries.flatMap((entry) => entry?.todos ?? [])
  // Today counts its own slice, not every todo in every list — the line
  // has to describe what the view actually shows
  // (docs/specs/today-view.md).
  const shown =
    options.view === 'today'
      ? selectToday(todos, options.now ?? new Date())
      : todos
  return countSummary(shown, { pending })
}
