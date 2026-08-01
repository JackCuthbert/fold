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
    // Stamp `created` here, client-side, rather than letting the server do
    // it: the optimistic placeholder and the stored copy must carry the
    // same value or they'd sort differently and the new todo would jump
    // when the response landed (docs/specs/todos.md — ordering).
    add: (todo: NewTodo) =>
      mutate({
        id: crypto.randomUUID(),
        kind: 'createTodo',
        listId,
        todo: { created: new Date().toISOString(), ...todo },
      }),
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
