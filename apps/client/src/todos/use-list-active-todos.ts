import type { Todo, TodosResponse } from '@fold/schemas'
import { useQueryClient } from '@tanstack/react-query'
import { useCacheVersion } from './use-cache-version'

/**
 * A list's still-open todos, read from the cache the list pane already
 * populates (docs/specs/list-kinds.md — bulk complete and bulk schedule).
 *
 * Never fetches. The bulk actions live in the header, which renders
 * beside the pane rather than inside it, so they need the same todos
 * without becoming a second reader of the server — exactly the constraint
 * `useViewCount` solves, and solved the same way.
 *
 * Empty until the pane's query lands, which is the right default: the
 * buttons hide when there is nothing to act on, so a slow load shows no
 * controls rather than controls that would act on nothing.
 */
export function useListActiveTodos(listId: string | null): Todo[] {
  const queryClient = useQueryClient()

  // Shared with useViewCount — see use-cache-version.ts for why these two
  // must not keep separate counters or separate filters.
  useCacheVersion()

  if (!listId) return []
  const entry = queryClient.getQueryData<TodosResponse>(['todos', listId])
  return (entry?.todos ?? []).filter((todo) => !todo.completed)
}
