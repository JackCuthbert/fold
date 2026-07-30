import type {
  Mutation,
  NewTodo,
  Todo,
  TodoChanges,
  TodosResponse,
} from '@caldav-todo/schemas'
import { queryClient, useSyncEngine } from '../providers'
import { applyMutationToTodos } from '../sync/optimistic'

// Optimistic write path — docs/specs/sync-and-offline.md (writes).
export function useTodoActions(listId: string) {
  const engine = useSyncEngine()

  const mutate = (mutation: Mutation): void => {
    queryClient.setQueryData<TodosResponse>(['todos', listId], (cache) =>
      applyMutationToTodos(cache ?? { ctag: '', todos: [] }, mutation),
    )
    void engine.enqueue(mutation)
  }

  return {
    add: (todo: NewTodo) =>
      mutate({ id: crypto.randomUUID(), kind: 'createTodo', listId, todo }),
    update: (todo: Todo, changes: TodoChanges) =>
      mutate({
        id: crypto.randomUUID(),
        kind: 'updateTodo',
        listId,
        uid: todo.uid,
        etag: todo.etag,
        changes,
      }),
    remove: (todo: Todo) =>
      mutate({
        id: crypto.randomUUID(),
        kind: 'deleteTodo',
        listId,
        uid: todo.uid,
        etag: todo.etag,
      }),
  }
}
