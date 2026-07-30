import type {
  Mutation,
  Todo,
  TodoList,
  TodosResponse,
} from '@caldav-todo/schemas'

// Optimistic cache updates — docs/specs/sync-and-offline.md (writes).
export function applyMutationToTodos(
  cache: TodosResponse,
  mutation: Mutation,
): TodosResponse {
  switch (mutation.kind) {
    case 'createTodo': {
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

export function applyMutationToLists(
  lists: readonly TodoList[],
  mutation: Mutation,
): TodoList[] {
  switch (mutation.kind) {
    case 'createList':
      return [
        ...lists,
        {
          id: mutation.listId,
          href: '',
          displayName: mutation.displayName,
          ctag: '',
        },
      ]
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
