import type { Mutation, Todo, TodoList, TodosResponse } from '@fold/schemas'

// Optimistic cache updates — docs/specs/sync-and-offline.md (writes).
export function applyMutationToTodos(
  cache: TodosResponse,
  mutation: Mutation,
): TodosResponse {
  switch (mutation.kind) {
    case 'createTodo': {
      // Idempotent: a queued createTodo can be re-applied during
      // reconciliation (docs/specs/sync-and-offline.md) after the mutation
      // has *already* landed on the server but before the outbox has
      // acked it — the server response would then already contain this
      // uid, and blindly appending again would duplicate the todo.
      if (cache.todos.some((todo) => todo.uid === mutation.todo.uid)) {
        return cache
      }
      const placeholder: Todo = {
        ...mutation.todo,
        listId: mutation.listId,
        href: '',
        etag: '',
        completed: false,
      }
      return { ...cache, todos: [...cache.todos, placeholder] }
    }
    case 'updateTodo':
      return {
        ...cache,
        todos: cache.todos.map((todo) => {
          if (todo.uid !== mutation.uid) return todo
          const { due, description, priority, ...rest } = mutation.changes
          const next: Todo = {
            ...todo,
            ...(rest.summary !== undefined ? { summary: rest.summary } : {}),
            ...(rest.completed !== undefined
              ? { completed: rest.completed }
              : {}),
          }
          if (due !== undefined) {
            if (due === null) delete next.due
            else next.due = due
          }
          if (description !== undefined) {
            if (description === null) delete next.description
            else next.description = description
          }
          if (priority !== undefined) {
            if (priority === null) delete next.priority
            else next.priority = priority
          }
          return next
        }),
      }
    case 'deleteTodo':
      return {
        ...cache,
        todos: cache.todos.filter((todo) => todo.uid !== mutation.uid),
      }
    default:
      return cache
  }
}

/**
 * Replace a todo in the cache with the server's authoritative copy (real
 * href/etag), in place by uid. Used right after a createTodo/updateTodo
 * succeeds — docs/specs/sync-and-offline.md — so the optimistic
 * placeholder's empty etag never lingers in the UI-facing cache waiting
 * for a refetch that (by design) may not happen for a while. A dependent
 * mutation queued in that window (e.g. completing a todo the instant
 * after creating it) would otherwise carry a stale/empty etag and get
 * rejected by the server.
 */
export function patchTodo(cache: TodosResponse, todo: Todo): TodosResponse {
  const index = cache.todos.findIndex((existing) => existing.uid === todo.uid)
  if (index === -1) return { ...cache, todos: [...cache.todos, todo] }
  return {
    ...cache,
    todos: cache.todos.map((existing, i) => (i === index ? todo : existing)),
  }
}

// docs/specs/lists.md — Ordering: the server returns lists in collection
// (creation) order, not alphabetical, so the client renders them in that
// same order and never re-sorts. The optimistic insert appends the
// placeholder at the end, matching where the server will place the new
// list, so nothing moves once the real response lands.
/**
 * The one ordering rule for lists, used on read and on optimistic insert
 * alike so the two can never disagree (docs/specs/lists.md — ordering).
 */
export const byDisplayName = (a: TodoList, b: TodoList): number =>
  a.displayName.localeCompare(b.displayName)

export function applyMutationToLists(
  lists: readonly TodoList[],
  mutation: Mutation,
): TodoList[] {
  switch (mutation.kind) {
    case 'createList': {
      // Idempotent for the same reason as applyMutationToTodos'
      // createTodo case — see the comment there.
      if (lists.some((list) => list.id === mutation.listId)) {
        return [...lists]
      }
      const placeholder: TodoList = {
        id: mutation.listId,
        href: '',
        displayName: mutation.displayName,
        ctag: '',
      }
      // Sorted, matching how the nav renders every list
      // (engine.ts's reconcileLists) — the server's own order is arbitrary
      // (UUID directory names in filesystem order), so the client imposes
      // a stable one and the optimistic insert must use the same rule or
      // the row jumps when the response lands
      // (docs/specs/lists.md — ordering).
      return [...lists, placeholder].toSorted(byDisplayName)
    }
    case 'renameList':
      return lists.map((list) =>
        list.id === mutation.listId
          ? { ...list, displayName: mutation.displayName }
          : list,
      )
    case 'deleteList':
      return lists.filter((list) => list.id !== mutation.listId)
    default:
      return [...lists]
  }
}
