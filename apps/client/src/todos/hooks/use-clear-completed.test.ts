import type { Todo } from '@fold/schemas'
import { describe, expect, it } from 'vitest'
import { deleteMutationFor } from './use-clear-completed'

const todo = (uid: string, listId: string): Todo => ({
  uid,
  listId,
  href: `/${listId}/${uid}`,
  etag: `etag-${uid}`,
  summary: uid,
  completed: true,
})

// docs/specs/summary-view.md — clearing from Summary reaches every list.
describe('deleteMutationFor', () => {
  it('routes each todo to its own list', () => {
    const mutations = [todo('a', 'work'), todo('b', 'home')].map(
      deleteMutationFor,
    )

    // The whole point of the cross-list clear: two todos selected in one
    // view must not both be addressed to one list.
    expect(mutations.map((m) => m.listId)).toEqual(['work', 'home'])
  })

  it('carries the etag the todo was read with', () => {
    // Without it the delete is unconditional, and a todo edited on another
    // device since this view loaded would be destroyed rather than
    // conflicting (docs/specs/sync-and-offline.md).
    expect(deleteMutationFor(todo('a', 'work'))).toMatchObject({
      kind: 'deleteTodo',
      uid: 'a',
      etag: 'etag-a',
    })
  })

  it('gives every mutation a distinct id', () => {
    const a = deleteMutationFor(todo('a', 'work'))
    const b = deleteMutationFor(todo('b', 'work'))

    // The outbox keys by id — a shared one would coalesce two deletes in
    // the same list into one, silently leaving a todo behind.
    expect(a.id).not.toBe(b.id)
  })
})
