import type { Mutation, TodosResponse } from '@caldav-todo/schemas'
import { describe, expect, it } from 'vitest'
import {
  applyMutationToLists,
  applyMutationToTodos,
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
})
