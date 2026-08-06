import type { NewTodo, TodosResponse } from '@fold/schemas'
import { useState } from 'react'
import { queryClient, useSyncEngine } from '../providers'
import { applyMutationToTodos } from '../sync/optimistic/optimistic'

/**
 * Creating a todo from outside any list (issue #15).
 *
 * `useTodoActions` binds its list at hook-call time, which is right for
 * the in-list path — the list is fixed for as long as that pane is open.
 * Here the list is chosen *inside* the form, so it can only be known at
 * submit time, and a hook per list is not something a component can do.
 *
 * The write itself is deliberately identical to `useTodoActions.add`:
 * same optimistic cache update, same outbox enqueue, same client-stamped
 * `created` (docs/specs/sync-and-offline.md — writes). Only where the
 * list id comes from differs.
 */
export function useGlobalAddTodo() {
  const engine = useSyncEngine()
  const [open, setOpen] = useState(false)

  const add = (listId: string, todo: NewTodo): void => {
    const mutation = {
      id: crypto.randomUUID(),
      kind: 'createTodo' as const,
      listId,
      // Stamped client-side so the optimistic row and the stored copy sort
      // identically — see use-todo-actions.ts.
      todo: { created: new Date().toISOString(), ...todo },
    }
    queryClient.setQueryData<TodosResponse>(['todos', listId], (cache) =>
      applyMutationToTodos(cache ?? { ctag: '', todos: [] }, mutation, listId),
    )
    void engine.enqueue(mutation)
  }

  return { open, setOpen, add }
}
