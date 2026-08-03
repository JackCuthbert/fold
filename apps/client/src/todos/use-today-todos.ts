import type { TodoList, TodosResponse } from '@fold/schemas'
import { useQueries } from '@tanstack/react-query'
import { api, queryClient, useSyncEngine } from '../providers'

/**
 * Every list's todos, read through the *same* queries the list views use
 * (docs/specs/today-view.md — fetching).
 *
 * Sharing `['todos', listId]` rather than adding a query of its own is
 * load-bearing, not an optimisation: mutations are keyed by list
 * (use-todo-actions.ts), so completing a todo from Today writes to the
 * cache its own list reads. A separate "today" cache would drift from it.
 *
 * The per-list `ctag` short-circuit keeps the fan-out cheap — an unchanged
 * list costs one conditional request that returns 304
 * (docs/specs/caldav-compliance.md).
 */
export function useTodayTodos(lists: readonly TodoList[]) {
  const engine = useSyncEngine()

  return useQueries({
    queries: lists.map((list) => ({
      queryKey: ['todos', list.id],
      queryFn: async () => {
        // Identical to TodoPane's fetcher, including the raw-vs-reconciled
        // split: the ctag must come from the last *raw* server response,
        // never the reconciled cache, or still-queued mutations would be
        // re-applied on top of themselves on every refetch.
        const rawKey = ['todos', list.id, 'raw'] as const
        const rawPrevious = queryClient.getQueryData<TodosResponse>(rawKey)
        const fresh = await api.getTodos(
          list.id,
          rawPrevious?.ctag ? rawPrevious.ctag : undefined,
        )
        const result = fresh ?? rawPrevious ?? { ctag: '', todos: [] }
        queryClient.setQueryData(rawKey, result)
        return engine.reconcileTodos(list.id, result)
      },
    })),
    combine: (results) => ({
      todos: results.flatMap((result) => result.data?.todos ?? []),
      // Only "loading" while nothing has arrived yet — one slow list must
      // not blank out the todos already fetched from the others.
      isPending: results.length > 0 && results.every((r) => r.isPending),
    }),
  })
}
