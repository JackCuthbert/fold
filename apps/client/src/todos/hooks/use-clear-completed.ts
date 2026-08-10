import type { Mutation, Todo, TodosResponse } from '@fold/schemas'
import { queryClient, useSyncEngine } from '../../providers'
import { applyMutationToTodos } from '../../sync/optimistic'

/**
 * Delete a set of completed todos that may span several lists.
 *
 * `useTodoActions` is keyed by a single `listId`, which is right for every
 * other write in the app — a todo is created, edited and deleted in the
 * list you are looking at. Clearing from Summary is the exception: that
 * view gathers finished work from every list, so the todos it offers to
 * clear can belong to any of them (docs/specs/summary-view.md).
 *
 * Rather than call a per-list hook in a loop — which the rules of hooks
 * forbid, since the set of lists is not known at render — this takes the
 * todos and routes each mutation to its own list's cache.
 *
 * One `deleteTodo` per todo, through the ordinary optimistic path, exactly
 * as the per-list clear does: the outbox already coalesces and retries
 * these, so a bulk mutation kind would need its own conflict handling for
 * no benefit (docs/specs/sync-and-offline.md).
 *
 * *(added 2026-08-09, issue #1.)*
 */
/**
 * The delete mutation for one todo.
 *
 * Pulled out and exported so the routing can be tested directly: every
 * field here has to come from the *todo*, not from an ambient "current
 * list". A `listId` taken from the view instead would still typecheck and
 * still delete something — just the wrong row, in whichever list happened
 * to be open. That is the failure this function exists to pin down.
 */
export function deleteMutationFor(todo: Todo): Mutation {
  return {
    id: crypto.randomUUID(),
    kind: 'deleteTodo',
    listId: todo.listId,
    uid: todo.uid,
    etag: todo.etag,
  }
}

export function useClearCompleted(): (todos: readonly Todo[]) => void {
  const engine = useSyncEngine()

  return (todos) => {
    for (const todo of todos) {
      const mutation = deleteMutationFor(todo)
      // The row leaves its own list's cache immediately, so a clear across
      // several lists reads as one action rather than each view catching up
      // at its own pace.
      queryClient.setQueryData<TodosResponse>(['todos', todo.listId], (cache) =>
        applyMutationToTodos(
          cache ?? { ctag: '', todos: [] },
          mutation,
          todo.listId,
        ),
      )
      void engine.enqueue(mutation)
    }
  }
}
