import type {
  Mutation,
  NewTodo,
  Todo,
  TodoChanges,
  TodosResponse,
} from '@fold/schemas'
import { queryClient, useSyncEngine } from '../../providers'
import { applyMutationToTodos } from '../../sync/optimistic'

/**
 * The same write path, for a caller that does not know its list until it
 * has the todo in hand.
 *
 * A row's context menu is the case (docs/specs/todos.md — row actions):
 * Today, Tomorrow, Summary and Search draw rows from several lists at
 * once, so `useTodoActions(activeView)` would queue every write against
 * the wrong collection. Hooks cannot be called per row, so this returns a
 * *builder* instead — one hook call, a writer per todo.
 *
 * *(added 2026-08-11, issue #40.)*
 */
export function useTodoActionsFor(): (listId: string) => TodoActions {
  const engine = useSyncEngine()
  return (listId) => buildTodoActions(listId, engine)
}

// Optimistic write path — docs/specs/sync-and-offline.md (writes).
export function useTodoActions(listId: string) {
  const engine = useSyncEngine()
  return buildTodoActions(listId, engine)
}

export type TodoActions = ReturnType<typeof buildTodoActions>

function buildTodoActions(
  listId: string,
  engine: ReturnType<typeof useSyncEngine>,
) {
  // A move touches two caches (source and target); everything else touches
  // one (docs/specs/todos.md — moving a todo between lists).
  const mutate = (mutation: Mutation, ...alsoUpdate: string[]): void => {
    for (const cacheListId of [listId, ...alsoUpdate]) {
      queryClient.setQueryData<TodosResponse>(['todos', cacheListId], (cache) =>
        applyMutationToTodos(
          cache ?? { ctag: '', todos: [] },
          mutation,
          cacheListId,
        ),
      )
    }
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
    /**
     * Move a todo to another list — copy to the target, then delete the
     * original (docs/specs/todos.md — moving a todo between lists).
     *
     * The full body travels with the mutation because the source resource
     * is gone by the time any retry runs; re-reading it then would 404.
     * `created` is carried over so the todo keeps its position in the
     * target's ordering rather than jumping to the end
     * (docs/specs/todos.md — ordering).
     */
    move: (todo: Todo, targetListId: string) =>
      mutate(
        {
          id: crypto.randomUUID(),
          kind: 'moveTodo',
          listId,
          targetListId,
          uid: todo.uid,
          etag: todo.etag,
          todo: {
            uid: todo.uid,
            summary: todo.summary,
            ...(todo.due ? { due: todo.due } : {}),
            ...(todo.description ? { description: todo.description } : {}),
            ...(todo.priority ? { priority: todo.priority } : {}),
            ...(todo.created ? { created: todo.created } : {}),
          },
        },
        targetListId,
      ),
  }
}
