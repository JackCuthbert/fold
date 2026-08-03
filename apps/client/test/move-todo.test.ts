import type { Mutation, TodosResponse } from '@fold/schemas'
import { describe, expect, it } from 'vitest'
import { coalesceMutations } from '../src/sync/coalesce'
import { applyMutationToTodos } from '../src/sync/optimistic'

const SOURCE: TodosResponse = {
  ctag: 'c1',
  todos: [
    {
      uid: 'a',
      listId: 'l1',
      href: '/a',
      etag: 'e1',
      summary: 'A',
      completed: false,
      created: '2026-08-01T00:00:00.000Z',
    },
  ],
}

const TARGET: TodosResponse = { ctag: 'c2', todos: [] }

const move: Mutation = {
  id: '00000000-0000-4000-8000-000000000001',
  kind: 'moveTodo',
  listId: 'l1',
  targetListId: 'l2',
  uid: 'a',
  etag: 'e1',
  todo: { uid: 'a', summary: 'A', created: '2026-08-01T00:00:00.000Z' },
}

// docs/specs/todos.md — moving a todo between lists.
describe('applyMutationToTodos for a move', () => {
  it('removes the todo from the source list', () => {
    expect(applyMutationToTodos(SOURCE, move, 'l1').todos).toEqual([])
  })

  it('adds the todo to the target list', () => {
    const next = applyMutationToTodos(TARGET, move, 'l2')
    expect(next.todos.map((t) => t.uid)).toEqual(['a'])
    expect(next.todos[0]).toMatchObject({ summary: 'A', listId: 'l2' })
  })

  it('carries `created` across, so the todo keeps its ordering position', () => {
    const next = applyMutationToTodos(TARGET, move, 'l2')
    expect(next.todos[0]?.created).toBe('2026-08-01T00:00:00.000Z')
  })

  it('leaves an unrelated list untouched', () => {
    const other: TodosResponse = { ctag: 'c3', todos: [] }
    expect(applyMutationToTodos(other, move, 'l3')).toBe(other)
  })

  it('is idempotent on the target, so reconciliation cannot duplicate', () => {
    const once = applyMutationToTodos(TARGET, move, 'l2')
    const twice = applyMutationToTodos(once, move, 'l2')
    expect(twice.todos.map((t) => t.uid)).toEqual(['a'])
  })
})

describe('coalesceMutations for a move', () => {
  it('folds a pending edit into the move payload', () => {
    // The edit was queued against the *source* list. After the move that
    // resource is gone, so dispatching it would 404 — it has to travel
    // with the copy instead.
    const pendingEdit: Mutation = {
      id: '00000000-0000-4000-8000-000000000002',
      kind: 'updateTodo',
      listId: 'l1',
      uid: 'a',
      etag: 'e1',
      changes: { summary: 'A renamed', priority: 'high' },
    }
    const queue = coalesceMutations([pendingEdit], move)
    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({
      kind: 'moveTodo',
      todo: { summary: 'A renamed', priority: 'high' },
    })
  })

  it('keeps edits for a different todo', () => {
    const otherEdit: Mutation = {
      id: '00000000-0000-4000-8000-000000000003',
      kind: 'updateTodo',
      listId: 'l1',
      uid: 'b',
      etag: 'e9',
      changes: { summary: 'B renamed' },
    }
    const queue = coalesceMutations([otherEdit], move)
    expect(queue.map((m) => m.kind)).toEqual(['updateTodo', 'moveTodo'])
  })

  it('queues the move as-is when nothing is pending', () => {
    expect(coalesceMutations([], move)).toEqual([move])
  })
})
