import { FatalError, RetryableError } from '@caldav-todo/outbox'
import type { Mutation, Todo } from '@caldav-todo/schemas'
import { describe, expect, it, vi } from 'vitest'
import type { Api } from '../src/api/client'
import { ApiError, NetworkError } from '../src/api/errors'
import { makeProcessMutation } from '../src/sync/process'

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

describe('processMutation', () => {
  it('dispatches updateTodo to the api', async () => {
    const updateTodo = vi.fn().mockResolvedValue(FRESH)
    const process = makeProcessMutation(fakeApi({ updateTodo }), vi.fn())
    await process(update)
    expect(updateTodo).toHaveBeenCalledWith('l1', 'a', 'e1', {
      completed: true,
    })
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
})
