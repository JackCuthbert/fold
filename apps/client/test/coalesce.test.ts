import type { Mutation } from '@caldav-todo/schemas'
import { describe, expect, it } from 'vitest'
import { coalesceMutations } from '../src/sync/coalesce'

let n = 0
const id = () => `00000000-0000-4000-8000-${String(n++).padStart(12, '0')}`

const createTodo = (uid: string): Mutation => ({
  id: id(),
  kind: 'createTodo',
  listId: 'l1',
  todo: { uid, summary: 'new' },
})
const updateTodo = (
  uid: string,
  changes: Record<string, unknown>,
): Mutation => ({
  id: id(),
  kind: 'updateTodo',
  listId: 'l1',
  uid,
  etag: 'e1',
  changes,
})
const deleteTodo = (uid: string): Mutation => ({
  id: id(),
  kind: 'deleteTodo',
  listId: 'l1',
  uid,
  etag: 'e1',
})

const run = (queue: Mutation[], incoming: Mutation): Mutation[] =>
  coalesceMutations(queue, incoming)

describe('coalesceMutations', () => {
  it('merges consecutive updates to the same todo', () => {
    const queue = run(
      [updateTodo('a', { summary: 'x' })],
      updateTodo('a', {
        completed: true,
      }),
    )
    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({
      kind: 'updateTodo',
      changes: { summary: 'x', completed: true },
    })
  })

  it('later update fields win when merging', () => {
    const queue = run(
      [updateTodo('a', { summary: 'old' })],
      updateTodo('a', {
        summary: 'new',
      }),
    )
    expect(queue[0]).toMatchObject({ changes: { summary: 'new' } })
  })

  it('folds an update into a pending create', () => {
    const queue = run([createTodo('a')], updateTodo('a', { summary: 'z' }))
    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({
      kind: 'createTodo',
      todo: { uid: 'a', summary: 'z' },
    })
  })

  it('cancels a pending create when the todo is deleted', () => {
    const queue = run(
      [createTodo('a'), updateTodo('a', { summary: 'x' })],
      deleteTodo('a'),
    )
    expect(queue).toHaveLength(0)
  })

  it('keeps a delete for a todo that exists on the server', () => {
    const queue = run([], deleteTodo('a'))
    expect(queue).toHaveLength(1)
  })

  it('does not touch mutations for other todos or lists', () => {
    const other = updateTodo('b', { summary: 'keep' })
    const queue = run([other], updateTodo('a', { summary: 'x' }))
    expect(queue).toHaveLength(2)
  })

  it('deleteList cancels its create and drops queued todo mutations', () => {
    const createList: Mutation = {
      id: id(),
      kind: 'createList',
      listId: 'l1',
      displayName: 'L',
    }
    const queue = run([createList, createTodo('a')], {
      id: id(),
      kind: 'deleteList',
      listId: 'l1',
    })
    expect(queue).toHaveLength(0)
  })

  it('renameList merges into a pending createList', () => {
    const createList: Mutation = {
      id: id(),
      kind: 'createList',
      listId: 'l1',
      displayName: 'Old',
    }
    const queue = run([createList], {
      id: id(),
      kind: 'renameList',
      listId: 'l1',
      displayName: 'New',
    })
    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({ kind: 'createList', displayName: 'New' })
  })
})
