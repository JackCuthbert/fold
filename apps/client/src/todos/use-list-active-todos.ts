import type { Todo, TodosResponse } from '@fold/schemas'
import { useQueryClient } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'

// Bumped on every query-cache event — see use-view-count.ts, which uses
// the same trick for the same reason. Module scope, and shared harmlessly:
// its only job is to be a value that changed since the last render.
let cacheVersion = 0

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

  // `getSnapshot` must be pure, so the counter is bumped by the
  // subscription and only read here.
  useSyncExternalStore(
    (onChange) =>
      queryClient.getQueryCache().subscribe(() => {
        cacheVersion += 1
        onChange()
      }),
    () => cacheVersion,
  )

  if (!listId) return []
  const entry = queryClient.getQueryData<TodosResponse>(['todos', listId])
  return (entry?.todos ?? []).filter((todo) => !todo.completed)
}
