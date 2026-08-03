import { FatalError, RetryableError } from '@fold/outbox'
import type { Mutation, Todo } from '@fold/schemas'
import { describe, expect, it, vi } from 'vitest'
import type { Api } from '../src/api/client'
import { ApiError, NetworkError } from '../src/api/errors'
import {
  classifyBlockReason,
  makeProcessMutation,
  TaggedFatalError,
  TaggedRetryableError,
} from '../src/sync/process'

const FRESH: Todo = {
  uid: 'a',
  listId: 'l1',
  href: '/a',
  etag: 'e2',
  summary: 'A',
  completed: false,
}

const update: Mutation = {
  id: '00000000-0000-4000-8000-000000000001',
  kind: 'updateTodo',
  listId: 'l1',
  uid: 'a',
  etag: 'e1',
  changes: { completed: true },
}

const fakeApi = (overrides: Partial<Api>): Api => ({
  login: vi.fn(),
  logout: vi.fn(),
  getSession: vi.fn(),
  getLists: vi.fn(),
  createList: vi.fn(),
  renameList: vi.fn(),
  deleteList: vi.fn(),
  getTodos: vi.fn(),
  createTodo: vi.fn(),
  updateTodo: vi.fn(),
  deleteTodo: vi.fn(),
  ...overrides,
})

const create: Mutation = {
  id: '00000000-0000-4000-8000-000000000002',
  kind: 'createTodo',
  listId: 'l1',
  todo: { uid: 'a', summary: 'A' },
}

describe('processMutation', () => {
  it('dispatches updateTodo to the api', async () => {
    const updateTodo = vi.fn().mockResolvedValue(FRESH)
    const process = makeProcessMutation(fakeApi({ updateTodo }), vi.fn())
    await process(update)
    expect(updateTodo).toHaveBeenCalledWith('l1', 'a', 'e1', {
      completed: true,
    })
  })

  it('returns the server Todo so the caller can patch the cache with the real etag', async () => {
    const createTodo = vi.fn().mockResolvedValue(FRESH)
    const process = makeProcessMutation(fakeApi({ createTodo }), vi.fn())
    await expect(process(create)).resolves.toEqual(FRESH)
  })

  it('returns the server Todo for a successful updateTodo too', async () => {
    const updateTodo = vi.fn().mockResolvedValue(FRESH)
    const process = makeProcessMutation(fakeApi({ updateTodo }), vi.fn())
    await expect(process(update)).resolves.toEqual(FRESH)
  })

  it('rebases once on 412 using the fresh etag from the response', async () => {
    const updateTodo = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(412, { todo: FRESH }))
      .mockResolvedValue(FRESH)
    const process = makeProcessMutation(fakeApi({ updateTodo }), vi.fn())
    await process(update)
    expect(updateTodo).toHaveBeenNthCalledWith(2, 'l1', 'a', 'e2', {
      completed: true,
    })
  })

  it('returns the existing Todo when a retried createTodo 412s (already landed)', async () => {
    const createTodo = vi
      .fn()
      .mockRejectedValue(new ApiError(412, { todo: FRESH }))
    const process = makeProcessMutation(fakeApi({ createTodo }), vi.fn())
    await expect(process(create)).resolves.toEqual(FRESH)
  })

  it('gives up with FatalError when the rebase also conflicts', async () => {
    const updateTodo = vi
      .fn()
      .mockRejectedValue(new ApiError(412, { todo: FRESH }))
    const process = makeProcessMutation(fakeApi({ updateTodo }), vi.fn())
    await expect(process(update)).rejects.toBeInstanceOf(FatalError)
    expect(updateTodo).toHaveBeenCalledTimes(2)
  })

  it('maps NetworkError and 502 to RetryableError', async () => {
    for (const failure of [
      new NetworkError('offline'),
      new ApiError(502, { error: 'caldav_unreachable', message: 'down' }),
    ]) {
      const updateTodo = vi.fn().mockRejectedValue(failure)
      const process = makeProcessMutation(fakeApi({ updateTodo }), vi.fn())
      await expect(process(update)).rejects.toBeInstanceOf(RetryableError)
    }
  })

  it('maps every 5xx to RetryableError, not just 502', async () => {
    // A dead backend behind a reverse proxy/load balancer/CDN can surface
    // as any 5xx, not only 502 — all of them are the server's problem,
    // never the client's, so none of them should drop the mutation.
    for (const status of [500, 503, 504]) {
      const updateTodo = vi.fn().mockRejectedValue(new ApiError(status, {}))
      const process = makeProcessMutation(fakeApi({ updateTodo }), vi.fn())
      await expect(process(update)).rejects.toBeInstanceOf(RetryableError)
    }
  })

  it('tags every 5xx with the "server" block reason', async () => {
    for (const status of [500, 502, 503, 504]) {
      const updateTodo = vi.fn().mockRejectedValue(new ApiError(status, {}))
      const process = makeProcessMutation(fakeApi({ updateTodo }), vi.fn())
      await expect(process(update)).rejects.toMatchObject({
        reason: 'server',
      })
      await expect(process(update)).rejects.toBeInstanceOf(TaggedRetryableError)
    }
  })

  it('maps 401 to RetryableError and notifies onUnauthorized', async () => {
    const onUnauthorized = vi.fn()
    const updateTodo = vi.fn().mockRejectedValue(new ApiError(401, {}))
    const process = makeProcessMutation(fakeApi({ updateTodo }), onUnauthorized)
    await expect(process(update)).rejects.toBeInstanceOf(RetryableError)
    expect(onUnauthorized).toHaveBeenCalled()
  })

  it('maps other statuses (client bugs) to FatalError', async () => {
    const updateTodo = vi.fn().mockRejectedValue(new ApiError(400, {}))
    const process = makeProcessMutation(fakeApi({ updateTodo }), vi.fn())
    await expect(process(update)).rejects.toBeInstanceOf(FatalError)
  })

  it('tags a drop reason of "other" for a non-conflict fatal error', async () => {
    // A 400 (or any other unhandled 4xx) is a client-side bug, not a
    // conflict — nothing "changed on the server" — so the drop must be
    // tagged distinctly from a genuine conflict-after-rebase.
    const updateTodo = vi.fn().mockRejectedValue(new ApiError(400, {}))
    const process = makeProcessMutation(fakeApi({ updateTodo }), vi.fn())
    await expect(process(update)).rejects.toMatchObject({ reason: 'other' })
    await expect(process(update)).rejects.toBeInstanceOf(TaggedFatalError)
  })

  it('tags a drop reason of "conflict" when the rebase also conflicts', async () => {
    const updateTodo = vi
      .fn()
      .mockRejectedValue(new ApiError(412, { todo: FRESH }))
    const process = makeProcessMutation(fakeApi({ updateTodo }), vi.fn())
    await expect(process(update)).rejects.toMatchObject({
      reason: 'conflict',
    })
    await expect(process(update)).rejects.toBeInstanceOf(TaggedFatalError)
  })
})

describe('classifyBlockReason', () => {
  // Shared with the query layer so a failed read (getSession/getTodos/
  // getLists) can report the same blocked reason a failed mutation would —
  // docs/specs/sync-and-offline.md ("status must reflect reality").
  it('classifies a NetworkError as offline', () => {
    expect(classifyBlockReason(new NetworkError('offline'))).toBe('offline')
  })

  it('classifies any 5xx ApiError as server', () => {
    for (const status of [500, 502, 503, 504]) {
      expect(classifyBlockReason(new ApiError(status, {}))).toBe('server')
    }
  })

  it('does not classify a 4xx ApiError as blocked', () => {
    expect(classifyBlockReason(new ApiError(401, {}))).toBeNull()
    expect(classifyBlockReason(new ApiError(400, {}))).toBeNull()
  })

  it('does not classify an unrelated error as blocked', () => {
    expect(classifyBlockReason(new Error('boom'))).toBeNull()
  })
})

// docs/specs/todos.md — moving a todo between lists.
describe('processMutation: moveTodo', () => {
  const move: Mutation = {
    id: '00000000-0000-4000-8000-000000000009',
    kind: 'moveTodo',
    listId: 'l1',
    targetListId: 'l2',
    uid: 'a',
    etag: 'e1',
    todo: { uid: 'a', summary: 'A' },
  }

  it('copies to the target before deleting the original', async () => {
    const order: string[] = []
    const createTodo = vi.fn(async () => {
      order.push('create')
      return FRESH
    })
    const deleteTodo = vi.fn(async () => {
      order.push('delete')
    })
    const process = makeProcessMutation(
      fakeApi({ createTodo, deleteTodo }),
      vi.fn(),
    )
    await process(move)
    // Copy-first: a failed copy must leave the todo where it was, rather
    // than deleting the only copy.
    expect(order).toEqual(['create', 'delete'])
    expect(createTodo).toHaveBeenCalledWith('l2', move.todo)
    expect(deleteTodo).toHaveBeenCalledWith('l1', 'a', 'e1')
  })

  it('does not delete the original when the copy fails', async () => {
    const createTodo = vi.fn().mockRejectedValue(new NetworkError('offline'))
    const deleteTodo = vi.fn()
    const process = makeProcessMutation(
      fakeApi({ createTodo, deleteTodo }),
      vi.fn(),
    )
    await expect(process(move)).rejects.toBeInstanceOf(RetryableError)
    expect(deleteTodo).not.toHaveBeenCalled()
  })

  // The bug this guards: saving an edit alongside a move queues an update
  // ahead of it, so by dispatch time the source's etag has moved on. The
  // delete then 412s — and without a rebase the move was dropped as fatal,
  // leaving the todo in BOTH lists. Caught against live Radicale.
  it('rebases the delete onto a fresh etag rather than stranding a copy', async () => {
    const createTodo = vi.fn().mockResolvedValue(FRESH)
    const deleteTodo = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError(412, { todo: { ...FRESH, etag: 'e9' } }),
      )
      .mockResolvedValueOnce(undefined)
    const process = makeProcessMutation(
      fakeApi({ createTodo, deleteTodo }),
      vi.fn(),
    )
    await process(move)
    expect(deleteTodo).toHaveBeenLastCalledWith('l1', 'a', 'e9')
  })

  // A retry whose earlier attempt copied but died before deleting: the
  // create 412s because the target already holds it. That is this step's
  // result, not a failure — the move must go on to delete the original.
  it('treats an already-copied target as success and still deletes', async () => {
    const createTodo = vi
      .fn()
      .mockRejectedValue(new ApiError(412, { todo: FRESH }))
    const deleteTodo = vi.fn().mockResolvedValue(undefined)
    const process = makeProcessMutation(
      fakeApi({ createTodo, deleteTodo }),
      vi.fn(),
    )
    await expect(process(move)).resolves.toEqual(FRESH)
    expect(deleteTodo).toHaveBeenCalledWith('l1', 'a', 'e1')
  })

  it('treats an already-deleted original as success', async () => {
    const createTodo = vi.fn().mockResolvedValue(FRESH)
    const deleteTodo = vi.fn().mockRejectedValue(new ApiError(404, {}))
    const process = makeProcessMutation(
      fakeApi({ createTodo, deleteTodo }),
      vi.fn(),
    )
    await expect(process(move)).resolves.toEqual(FRESH)
  })
})
