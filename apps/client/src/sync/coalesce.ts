import type { Mutation, TodoChanges } from '@fold/schemas'

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
      // NewTodo (the create payload) has no `completed` field — a VTODO
      // is always created NEEDS-ACTION (docs/specs — vtodo create). So
      // `completed` can't be folded into the create itself; queue it as
      // a separate updateTodo that follows the create in FIFO order
      // instead of silently dropping it. Its etag is unknown until the
      // create lands, but the sync engine refreshes a stale/empty etag
      // from the cache immediately before dispatch, once the create
      // ahead of it has synced and patched in the real one.
      const { completed, ...fields } = incoming.changes
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
      const withCreate = queue.map((m, i) => (i === index ? merged : m))
      if (completed === undefined) return withCreate
      return [
        ...withCreate,
        {
          id: incoming.id,
          kind: 'updateTodo',
          listId: incoming.listId,
          uid: incoming.uid,
          // Placeholder — the real etag isn't known until the create
          // ahead of it in the queue lands. `mutationSchema` requires a
          // non-empty etag (so this mutation survives a reload), and the
          // sync engine refreshes it from the cache immediately before
          // dispatch; if it's somehow still stale by then, the server's
          // 412 conflict-rebase path (docs/specs/sync-and-offline.md)
          // recovers using the fresh etag it returns.
          etag: 'pending-create',
          changes: { completed },
        },
      ]
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

  // docs/specs/todos.md — moving a todo between lists. A move rewrites the
  // resource in a new collection, so any edit still queued against the
  // *source* list would dispatch at a URL that no longer exists. Fold those
  // pending changes into the move's payload instead — the copy then carries
  // them, and the stale entries are dropped.
  if (incoming.kind === 'moveTodo') {
    const pending = queue.filter(
      (m) =>
        m.kind === 'updateTodo' &&
        m.listId === incoming.listId &&
        m.uid === incoming.uid,
    )
    const changes: TodoChanges = {}
    for (const m of pending) {
      if (m.kind === 'updateTodo') Object.assign(changes, m.changes)
    }
    const remaining = queue.filter((m) => !pending.includes(m))
    if (Object.keys(changes).length === 0) return [...remaining, incoming]
    const { summary, due, description, priority } = changes
    return [
      ...remaining,
      {
        ...incoming,
        todo: {
          ...incoming.todo,
          ...(summary !== undefined ? { summary } : {}),
          ...(due != null ? { due } : {}),
          ...(description != null ? { description } : {}),
          ...(priority != null ? { priority } : {}),
        },
      },
    ]
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
