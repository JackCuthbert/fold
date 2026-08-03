import type { Mutation } from '@fold/schemas'
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

  it('keeps completed as a trailing update instead of dropping it', () => {
    // Regression: a NewTodo (create payload) has no `completed` field —
    // a VTODO is always created NEEDS-ACTION — so `completed` can't be
    // folded into the create. It must survive as a follow-up mutation,
    // not silently vanish (docs/specs/sync-and-offline.md).
    const queue = run([createTodo('a')], updateTodo('a', { completed: true }))
    expect(queue).toHaveLength(2)
    expect(queue[0]).toMatchObject({ kind: 'createTodo', todo: { uid: 'a' } })
    expect(queue[1]).toMatchObject({
      kind: 'updateTodo',
      uid: 'a',
      changes: { completed: true },
    })
  })

  it('folds non-completed fields into the create and splits off completed', () => {
    const queue = run(
      [createTodo('a')],
      updateTodo('a', { summary: 'z', completed: true }),
    )
    expect(queue).toHaveLength(2)
    expect(queue[0]).toMatchObject({
      kind: 'createTodo',
      todo: { uid: 'a', summary: 'z' },
    })
    expect(queue[1]).toMatchObject({
      kind: 'updateTodo',
      uid: 'a',
      changes: { completed: true },
    })
  })

  it('a later rename still folds into the create after completed splits off', () => {
    const afterComplete = run(
      [createTodo('a')],
      updateTodo('a', { completed: true }),
    )
    const queue = coalesceMutations(
      afterComplete,
      updateTodo('a', { summary: 'renamed' }),
    )
    expect(queue).toHaveLength(2)
    expect(queue[0]).toMatchObject({
      kind: 'createTodo',
      todo: { uid: 'a', summary: 'renamed' },
    })
    expect(queue[1]).toMatchObject({
      kind: 'updateTodo',
      changes: { completed: true },
    })
  })

  it('cancels a pending create when the todo is deleted', () => {
    const queue = run(
      [createTodo('a'), updateTodo('a', { summary: 'x' })],
      deleteTodo('a'),
    )
    expect(queue).toHaveLength(0)
  })

  it('cancels a pending create and its split-off completed update on delete', () => {
    const afterComplete = run(
      [createTodo('a')],
      updateTodo('a', { completed: true }),
    )
    const queue = coalesceMutations(afterComplete, deleteTodo('a'))
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

  // docs/specs/lists.md — nudging a list up three positions offline must
  // queue one PROPPATCH, not three; and a colour change followed by a move
  // must not lose the colour.
  it('merges consecutive setListProps for the same list, field-wise', () => {
    const setColor: Mutation = {
      id: id(),
      kind: 'setListProps',
      listId: 'a',
      color: '#1D9BF6',
    }
    const afterFirstMove = run([setColor], {
      id: id(),
      kind: 'setListProps',
      listId: 'a',
      order: 2,
    })
    const merged = coalesceMutations(afterFirstMove, {
      id: id(),
      kind: 'setListProps',
      listId: 'a',
      order: 3,
    })
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({
      kind: 'setListProps',
      listId: 'a',
      color: '#1D9BF6',
      order: 3,
    })
  })

  it('does not merge setListProps across different lists', () => {
    const merged = run(
      [{ id: id(), kind: 'setListProps', listId: 'a', order: 1 }],
      { id: id(), kind: 'setListProps', listId: 'b', order: 2 },
    )
    expect(merged).toHaveLength(2)
  })

  it('a later setListProps clearing a colour wins over an earlier set', () => {
    const merged = run(
      [{ id: id(), kind: 'setListProps', listId: 'a', color: '#1D9BF6' }],
      { id: id(), kind: 'setListProps', listId: 'a', color: null },
    )
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ kind: 'setListProps', color: null })
  })

  it('deleteList cancels queued setListProps for that list', () => {
    const merged = run(
      [{ id: id(), kind: 'setListProps', listId: 'l1', color: '#1D9BF6' }],
      { id: id(), kind: 'deleteList', listId: 'l1' },
    )
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ kind: 'deleteList' })
  })
})
