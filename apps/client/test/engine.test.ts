import { memoryStorage } from '@caldav-todo/outbox'
import type { Mutation } from '@caldav-todo/schemas'
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { Api } from '../src/api/client'
import { ApiError, NetworkError } from '../src/api/errors'
import { createSyncEngine } from '../src/sync/engine'

const mutation: Mutation = {
  id: '00000000-0000-4000-8000-000000000001',
  kind: 'createTodo',
  listId: 'l1',
  todo: { uid: 'a', summary: 'A' },
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

describe('sync engine', () => {
  it('drains enqueued mutations and invalidates the affected queries', async () => {
    const createTodo = vi.fn().mockResolvedValue({})
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const engine = await createSyncEngine({
      api: fakeApi({ createTodo }),
      queryClient,
      storage: memoryStorage(),
      onUnauthorized: vi.fn(),
      onDropped: vi.fn(),
      onStorageProblem: vi.fn(),
    })
    engine.start()
    await engine.enqueue(mutation)
    await vi.waitFor(() => expect(createTodo).toHaveBeenCalled())
    await vi.waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['todos', 'l1'] }),
    )
    engine.stop()
  })

  it('reports pending count while offline', async () => {
    const createTodo = vi.fn().mockRejectedValue(new NetworkError('offline'))
    const engine = await createSyncEngine({
      api: fakeApi({ createTodo }),
      queryClient: new QueryClient(),
      storage: memoryStorage(),
      onUnauthorized: vi.fn(),
      onDropped: vi.fn(),
      onStorageProblem: vi.fn(),
    })
    const seen: number[] = []
    engine.subscribe((status) => seen.push(status.pending))
    engine.start()
    await engine.enqueue(mutation)
    await vi.waitFor(() => expect(createTodo).toHaveBeenCalled())
    expect(seen.at(-1)).toBe(1)
    engine.stop()
  })

  it('reports blocked=server when the CalDAV server is down', async () => {
    const createTodo = vi
      .fn()
      .mockRejectedValue(new ApiError(502, { error: 'caldav_unreachable' }))
    const engine = await createSyncEngine({
      api: fakeApi({ createTodo }),
      queryClient: new QueryClient(),
      storage: memoryStorage(),
      onUnauthorized: vi.fn(),
      onDropped: vi.fn(),
      onStorageProblem: vi.fn(),
    })
    engine.start()
    await engine.enqueue(mutation)
    await vi.waitFor(() => expect(engine.getStatus().blocked).toBe('server'))
    engine.stop()
  })
})
