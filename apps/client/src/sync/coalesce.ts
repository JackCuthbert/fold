import type { Mutation } from '@caldav-todo/schemas'

// Coalescing rules — docs/specs/sync-and-offline.md (sync loop).
export function coalesceMutations(
  queue: readonly Mutation[],
  incoming: Mutation,
): Mutation[] {
  if (incoming.kind === 'updateTodo') {
    const index = queue.findIndex(
      (m) =>
        (m.kind === 'updateTodo' || m.kind === 'createTodo') &&
        m.listId === incoming.listId &&
        (m.kind === 'createTodo' ? m.todo.uid : m.uid) === incoming.uid,
    )
    const target = index === -1 ? undefined : queue[index]
    if (target?.kind === 'updateTodo') {
      const merged: Mutation = {
        ...target,
        changes: { ...target.changes, ...incoming.changes },
      }
      return queue.map((m, i) => (i === index ? merged : m))
    }
    if (target?.kind === 'createTodo') {
      const { completed: _completed, ...fields } = incoming.changes
      const merged: Mutation = {
        ...target,
        todo: {
          ...target.todo,
          ...(fields.summary !== undefined ? { summary: fields.summary } : {}),
          ...(fields.due != null ? { due: fields.due } : {}),
          ...(fields.description != null
            ? { description: fields.description }
            : {}),
          ...(fields.priority != null ? { priority: fields.priority } : {}),
        },
      }
      return queue.map((m, i) => (i === index ? merged : m))
    }
    return [...queue, incoming]
  }

  if (incoming.kind === 'deleteTodo') {
    const hadPendingCreate = queue.some(
      (m) =>
        m.kind === 'createTodo' &&
        m.listId === incoming.listId &&
        m.todo.uid === incoming.uid,
    )
    const remaining = queue.filter((m) => {
      if (m.listId !== incoming.listId) return true
      if (m.kind === 'createTodo') return m.todo.uid !== incoming.uid
      if (m.kind === 'updateTodo') return m.uid !== incoming.uid
      return true
    })
    // Never synced? Nothing to delete on the server.
    return hadPendingCreate ? remaining : [...remaining, incoming]
  }

  if (incoming.kind === 'renameList') {
    const index = queue.findIndex(
      (m) => m.kind === 'createList' && m.listId === incoming.listId,
    )
    if (index !== -1) {
      return queue.map((m, i) =>
        i === index && m.kind === 'createList'
          ? { ...m, displayName: incoming.displayName }
          : m,
      )
    }
    return [...queue, incoming]
  }

  if (incoming.kind === 'deleteList') {
    const hadPendingCreate = queue.some(
      (m) => m.kind === 'createList' && m.listId === incoming.listId,
    )
    const remaining = queue.filter((m) => m.listId !== incoming.listId)
    return hadPendingCreate ? remaining : [...remaining, incoming]
  }

  return [...queue, incoming]
}
