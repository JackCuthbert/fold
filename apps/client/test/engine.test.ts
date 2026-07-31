import { memoryStorage } from '@caldav-todo/outbox'
import type { Mutation, TodosResponse } from '@caldav-todo/schemas'
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

const otherMutation: Mutation = {
  id: '00000000-0000-4000-8000-000000000002',
  kind: 'createTodo',
  listId: 'l1',
  todo: { uid: 'b', summary: 'B' },
}

// Never resolves until the test lets it — used to hold a mutation "in
// flight" so the outbox stays non-empty for assertions.
const pending = <T>(): { promise: Promise<T>; resolve: (v: T) => void } => {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
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
  it('invalidates the affected queries once the outbox fully drains', async () => {
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

  it('does not invalidate anything while the outbox is non-empty', async () => {
    const first = pending<unknown>()
    const second = pending<unknown>()
    const createTodo = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
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
    // Two mutations queued: both are held in flight so the outbox never
    // reaches empty during this test. Resolving the first must not
    // invalidate anything even though it "succeeded" — the second is
    // still queued behind it.
    await engine.enqueue(mutation)
    await engine.enqueue(otherMutation)
    await vi.waitFor(() => expect(createTodo).toHaveBeenCalledTimes(1))

    first.resolve({})
    await vi.waitFor(() => expect(createTodo).toHaveBeenCalledTimes(2))
    expect(invalidate).not.toHaveBeenCalled()

    second.resolve({})
    await vi.waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['todos', 'l1'] }),
    )
    engine.stop()
  })

  it('a dropped mutation still invalidates its queries', async () => {
    const createTodo = vi
      .fn()
      .mockRejectedValue(new ApiError(400, { error: 'bad_request' }))
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
    await vi.waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['todos', 'l1'] }),
    )
    engine.stop()
  })

  it('reconcileTodos re-applies queued mutations over fresh server data', async () => {
    const engine = await createSyncEngine({
      api: fakeApi({}),
      queryClient: new QueryClient(),
      storage: memoryStorage(),
      onUnauthorized: vi.fn(),
      onDropped: vi.fn(),
      onStorageProblem: vi.fn(),
    })
    await engine.enqueue(mutation)
    // Server data doesn't know about our queued createTodo yet — a naive
    // refetch would clobber it. Reconciliation must bring it back.
    const serverResponse: TodosResponse = { ctag: 'c2', todos: [] }
    const reconciled = engine.reconcileTodos('l1', serverResponse)
    expect(reconciled.todos.map((t) => t.uid)).toEqual(['a'])
  })

  it('reconcileTodos passes through genuinely new server data untouched', async () => {
    const engine = await createSyncEngine({
      api: fakeApi({}),
      queryClient: new QueryClient(),
      storage: memoryStorage(),
      onUnauthorized: vi.fn(),
      onDropped: vi.fn(),
      onStorageProblem: vi.fn(),
    })
    // Nothing queued — this is a real remote change, not an echo of our
    // own write, so it must appear as-is.
    const serverResponse: TodosResponse = {
      ctag: 'c3',
      todos: [
        {
          uid: 'remote',
          listId: 'l1',
          href: '/remote',
          etag: 'e9',
          summary: 'From another device',
          completed: false,
        },
      ],
    }
    const reconciled = engine.reconcileTodos('l1', serverResponse)
    expect(reconciled).toEqual(serverResponse)
  })

  it('reconcileTodos does not duplicate a createTodo that already landed', async () => {
    // Regression: the outbox only acks a mutation *after* process()
    // resolves, so there is a window where the server already has the
    // todo but the mutation is still queued. Reconciling in that window
    // must not append a second copy.
    const engine = await createSyncEngine({
      api: fakeApi({}),
      queryClient: new QueryClient(),
      storage: memoryStorage(),
      onUnauthorized: vi.fn(),
      onDropped: vi.fn(),
      onStorageProblem: vi.fn(),
    })
    await engine.enqueue(mutation)
    const serverResponse: TodosResponse = {
      ctag: 'c5',
      todos: [
        {
          uid: 'a',
          listId: 'l1',
          href: '/a',
          etag: 'e1',
          summary: 'A',
          completed: false,
        },
      ],
    }
    const reconciled = engine.reconcileTodos('l1', serverResponse)
    expect(reconciled.todos).toHaveLength(1)
  })

  it('reconcileTodos ignores queued mutations for a different list', async () => {
    const engine = await createSyncEngine({
      api: fakeApi({}),
      queryClient: new QueryClient(),
      storage: memoryStorage(),
      onUnauthorized: vi.fn(),
      onDropped: vi.fn(),
      onStorageProblem: vi.fn(),
    })
    await engine.enqueue(mutation) // listId: 'l1'
    const serverResponse: TodosResponse = { ctag: 'c4', todos: [] }
    const reconciled = engine.reconcileTodos('l2', serverResponse)
    expect(reconciled.todos).toEqual([])
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
