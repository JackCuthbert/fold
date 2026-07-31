import type { Mutation, Todo, TodosResponse } from '@caldav-todo/schemas'
import { describe, expect, it } from 'vitest'
import {
  applyMutationToLists,
  applyMutationToTodos,
  patchTodo,
} from '../src/sync/optimistic'

const CACHE: TodosResponse = {
  ctag: 'c1',
  todos: [
    {
      uid: 'a',
      listId: 'l1',
      href: '/a',
      etag: 'e1',
      summary: 'A',
      completed: false,
      due: { kind: 'date', value: '2026-08-01' },
    },
  ],
}

describe('applyMutationToTodos', () => {
  it('appends a placeholder for createTodo', () => {
    const mutation: Mutation = {
      id: '00000000-0000-4000-8000-000000000001',
      kind: 'createTodo',
      listId: 'l1',
      todo: { uid: 'b', summary: 'B' },
    }
    const next = applyMutationToTodos(CACHE, mutation)
    expect(next.todos.map((t) => t.uid)).toEqual(['a', 'b'])
    expect(next.todos[1]).toMatchObject({ summary: 'B', completed: false })
  })

  it('merges changes and clears nulled fields for updateTodo', () => {
    const mutation: Mutation = {
      id: '00000000-0000-4000-8000-000000000002',
      kind: 'updateTodo',
      listId: 'l1',
      uid: 'a',
      etag: 'e1',
      changes: { completed: true, due: null },
    }
    const next = applyMutationToTodos(CACHE, mutation)
    expect(next.todos[0]).toMatchObject({ completed: true })
    expect(next.todos[0]?.due).toBeUndefined()
  })

  it('createTodo is a no-op if the uid is already present (reconciliation)', () => {
    // A queued createTodo can be re-applied during reconciliation after
    // the mutation already landed on the server but before the outbox
    // acked it (docs/specs/sync-and-offline.md) — the fresh server data
    // would already contain this uid, so re-applying must not duplicate.
    const mutation: Mutation = {
      id: '00000000-0000-4000-8000-000000000099',
      kind: 'createTodo',
      listId: 'l1',
      todo: { uid: 'a', summary: 'A' },
    }
    const next = applyMutationToTodos(CACHE, mutation)
    expect(next.todos).toHaveLength(1)
    expect(next).toEqual(CACHE)
  })

  it('removes the todo for deleteTodo', () => {
    const mutation: Mutation = {
      id: '00000000-0000-4000-8000-000000000003',
      kind: 'deleteTodo',
      listId: 'l1',
      uid: 'a',
      etag: 'e1',
    }
    expect(applyMutationToTodos(CACHE, mutation).todos).toHaveLength(0)
  })
})

describe('applyMutationToLists', () => {
  const lists = [{ id: 'l1', href: '/l1/', displayName: 'One', ctag: 'c' }]

  it('appends createList, renames renameList, removes deleteList', () => {
    const created = applyMutationToLists(lists, {
      id: '00000000-0000-4000-8000-000000000004',
      kind: 'createList',
      listId: 'l2',
      displayName: 'Two',
    })
    expect(created.map((l) => l.id)).toEqual(['l1', 'l2'])

    const renamed = applyMutationToLists(lists, {
      id: '00000000-0000-4000-8000-000000000005',
      kind: 'renameList',
      listId: 'l1',
      displayName: 'Uno',
    })
    expect(renamed[0]?.displayName).toBe('Uno')

    const removed = applyMutationToLists(lists, {
      id: '00000000-0000-4000-8000-000000000006',
      kind: 'deleteList',
      listId: 'l1',
    })
    expect(removed).toHaveLength(0)
  })

  it('createList is a no-op if the id is already present (reconciliation)', () => {
    const next = applyMutationToLists(lists, {
      id: '00000000-0000-4000-8000-000000000007',
      kind: 'createList',
      listId: 'l1',
      displayName: 'Duplicate',
    })
    expect(next).toEqual(lists)
  })
})

describe('patchTodo', () => {
  it('replaces the matching todo in place with the server copy', () => {
    const serverTodo: Todo = {
      uid: 'a',
      listId: 'l1',
      href: '/real/a',
      etag: 'real-etag',
      summary: 'A',
      completed: false,
    }
    const next = patchTodo(CACHE, serverTodo)
    expect(next.todos).toHaveLength(1)
    expect(next.todos[0]).toEqual(serverTodo)
  })

  it('preserves the position of other todos', () => {
    const two: TodosResponse = {
      ctag: 'c1',
      todos: [
        {
          uid: 'a',
          listId: 'l1',
          href: '/a',
          etag: 'e1',
          summary: 'A',
          completed: false,
        },
        {
          uid: 'b',
          listId: 'l1',
          href: '/b',
          etag: 'e2',
          summary: 'B',
          completed: false,
        },
      ],
    }
    const serverTodo: Todo = {
      uid: 'b',
      listId: 'l1',
      href: '/real/b',
      etag: 'real-etag',
      summary: 'B',
      completed: false,
    }
    const next = patchTodo(two, serverTodo)
    expect(next.todos.map((t) => t.uid)).toEqual(['a', 'b'])
    expect(next.todos[1]).toEqual(serverTodo)
  })

  it('appends the todo if no existing entry matches its uid', () => {
    const serverTodo: Todo = {
      uid: 'z',
      listId: 'l1',
      href: '/z',
      etag: 'e9',
      summary: 'Z',
      completed: false,
    }
    const next = patchTodo(CACHE, serverTodo)
    expect(next.todos.map((t) => t.uid)).toEqual(['a', 'z'])
  })
})
