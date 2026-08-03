import {
  Outbox,
  SyncLoop,
  type FatalError,
  type OutboxStorage,
} from '@fold/outbox'
import {
  mutationSchema,
  type Mutation,
  type TodoList,
  type TodosResponse,
} from '@fold/schemas'
import type { QueryClient } from '@tanstack/react-query'
import type { Api } from '../api/client'
import { coalesceMutations } from './coalesce'
import {
  applyMutationToLists,
  byDisplayName,
  applyMutationToTodos,
  patchTodo,
} from './optimistic'
import {
  makeProcessMutation,
  TaggedRetryableError,
  type BlockReason,
} from './process'

export interface SyncStatus {
  pending: number
  blocked: BlockReason | null
}

export interface SyncEngineOptions {
  api: Api
  queryClient: QueryClient
  storage: OutboxStorage
  onUnauthorized: () => void
  onDropped: (mutation: Mutation, error: FatalError) => void
  /** Storage failed or corrupt entries were discarded — tell the user. */
  onStorageProblem: (message: string) => void
}

export type SyncEngine = Awaited<ReturnType<typeof createSyncEngine>>

type ListMutation = Extract<
  Mutation,
  { kind: 'createList' | 'renameList' | 'deleteList' }
>

const isListMutation = (mutation: Mutation): mutation is ListMutation =>
  mutation.kind === 'createList' ||
  mutation.kind === 'renameList' ||
  mutation.kind === 'deleteList'

export async function createSyncEngine(options: SyncEngineOptions) {
  const {
    api,
    queryClient,
    storage,
    onUnauthorized,
    onDropped,
    onStorageProblem,
  } = options
  const listeners = new Set<(status: SyncStatus) => void>()
  let status: SyncStatus = { pending: 0, blocked: null }

  const emit = (): void => {
    for (const listener of listeners) listener(status)
  }
  const notify = (pending: number): void => {
    // An empty outbox can't be blocked on anything — there's nothing left
    // to retry, so a stale `blocked` from an earlier failure must not
    // keep claiming the server is unreachable (docs/specs/sync-and-offline.md
    // — status reflects current conditions, not latched history).
    const blocked = pending === 0 ? null : status.blocked
    status = { ...status, pending, blocked }
    emit()
  }
  const setBlocked = (blocked: BlockReason | null): void => {
    if (status.blocked === blocked) return
    status = { ...status, blocked }
    emit()
  }

  const outbox = await Outbox.open<Mutation>({
    storage,
    parse: (raw) => {
      const parsed = mutationSchema.safeParse(raw)
      return parsed.success ? parsed.data : null
    },
    coalesce: coalesceMutations,
    onChange: notify,
    onPersistError: (error) => {
      console.error('outbox persist failed', error)
      onStorageProblem(
        "Couldn't save your changes locally — they may be lost if you " +
          'reload.',
      )
    },
    onDropOnLoad: (raw) => {
      console.error('discarded unreadable queued changes', raw)
      onStorageProblem(
        `Discarded ${raw.length} unreadable queued change${
          raw.length === 1 ? '' : 's'
        }.`,
      )
    },
  })
  notify(outbox.size())

  // The client is authoritative while work is queued —
  // docs/specs/sync-and-offline.md. A successful mutation must never
  // invalidate on its own: that races the server's response against our
  // own optimistic update and makes the UI churn. Instead we invalidate
  // once the outbox has fully drained (every queued write has landed), or
  // when a mutation is dropped outright, since the cache is then known to
  // be wrong.
  const invalidateAllFor = (mutation: Mutation): void => {
    void queryClient.invalidateQueries({
      queryKey: ['todos', mutation.listId],
    })
    if (isListMutation(mutation)) {
      void queryClient.invalidateQueries({ queryKey: ['lists'] })
    }
  }

  // Touched list ids (plus a lists-collection flag) accumulate while the
  // queue drains and are invalidated in one shot once it's empty, so a
  // long run of queued mutations doesn't refetch after each one.
  let touchedListIds = new Set<string>()
  let touchedLists = false

  // The etag on an updateTodo/deleteTodo mutation is captured at the
  // moment it's queued. If it was queued against a createTodo placeholder
  // that hadn't synced yet, that etag is '' — invalid, and rejected
  // outright by the server. By the time this mutation reaches the front
  // of the FIFO, the create ahead of it may have already synced and
  // patched the cache with the real etag (see below), so look up the
  // current one right before dispatch rather than trusting what was
  // captured at enqueue time.
  // A move carries an etag too — for its delete step — and needs the same
  // treatment for a sharper reason: saving an edit alongside a move queues
  // an update *ahead* of it against the same resource, so by dispatch time
  // the source's etag has always moved on. Without this the delete 412s,
  // and the todo is left in both lists (docs/specs/todos.md — moving a todo
  // between lists).
  const withFreshEtag = (mutation: Mutation): Mutation => {
    if (
      mutation.kind !== 'updateTodo' &&
      mutation.kind !== 'deleteTodo' &&
      mutation.kind !== 'moveTodo'
    ) {
      return mutation
    }
    // Read the *raw* server cache, not the reconciled one. A move has
    // already removed the todo from the reconciled source list
    // optimistically, so it would never be found there — but the raw cache
    // still holds the server's last-known copy, etag included. For updates
    // and deletes the two agree, so this is safe for every kind.
    const raw = queryClient.getQueryData<TodosResponse>([
      'todos',
      mutation.listId,
      'raw',
    ])
    const reconciled = queryClient.getQueryData<TodosResponse>([
      'todos',
      mutation.listId,
    ])
    const current =
      reconciled?.todos.find((todo) => todo.uid === mutation.uid) ??
      raw?.todos.find((todo) => todo.uid === mutation.uid)
    if (!current?.etag || current.etag === mutation.etag) return mutation
    return { ...mutation, etag: current.etag }
  }

  const process = makeProcessMutation(api, onUnauthorized)
  const loop = new SyncLoop<Mutation>({
    outbox,
    process: async (queued) => {
      const mutation = withFreshEtag(queued)
      try {
        const serverTodo = await process(mutation)
        setBlocked(null)
        if (serverTodo) {
          // createTodo/updateTodo succeeded: patch the cache with the
          // server's authoritative copy (real href/etag) right away,
          // rather than waiting for the drain-completion refetch below.
          // Without this, the optimistic placeholder's empty etag lingers
          // until that refetch runs, and a mutation queued against it in
          // the meantime (e.g. completing a todo the instant after
          // creating it) would carry a stale/invalid etag and get
          // rejected by the server as an unrecoverable error.
          const rawKey = ['todos', mutation.listId, 'raw'] as const
          queryClient.setQueryData<TodosResponse>(rawKey, (cache) =>
            cache ? patchTodo(cache, serverTodo) : cache,
          )
          queryClient.setQueryData<TodosResponse>(
            ['todos', mutation.listId],
            (cache) => (cache ? patchTodo(cache, serverTodo) : cache),
          )
        }
        touchedListIds.add(mutation.listId)
        if (isListMutation(mutation)) touchedLists = true
        if (outbox.size() === 1) {
          // The head mutation we just processed is about to be ack()'d by
          // the sync loop, which will bring the queue to empty. Refetch
          // now that there is nothing left queued to race against.
          for (const listId of touchedListIds) {
            void queryClient.invalidateQueries({ queryKey: ['todos', listId] })
          }
          if (touchedLists) {
            void queryClient.invalidateQueries({ queryKey: ['lists'] })
          }
          touchedListIds = new Set()
          touchedLists = false
        }
      } catch (error) {
        if (error instanceof TaggedRetryableError) setBlocked(error.reason)
        throw error
      }
    },
    onDrop: (mutation, error) => {
      // Server truth wins: refetch what we failed to change.
      invalidateAllFor(mutation)
      onDropped(mutation, error)
    },
  })

  return {
    start: () => loop.start(),
    stop: () => loop.stop(),
    kick: () => loop.kick(),
    enqueue: async (mutation: Mutation): Promise<void> => {
      await outbox.enqueue(mutation)
      loop.kick()
    },
    getStatus: (): SyncStatus => status,
    subscribe: (listener: (status: SyncStatus) => void): (() => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    /**
     * Status must be derived from current conditions, never latched
     * history (docs/specs/sync-and-offline.md). `blocked` is otherwise
     * only ever touched by the outbox's own mutation-processing loop, so
     * it can go stale for as long as the backoff timer between mutation
     * attempts if nothing else re-evaluates it — even while ordinary reads
     * (getSession/getTodos/getLists) are succeeding and proving the server
     * is reachable. Call this from any successful API call, mutation or
     * read alike, to clear a stale blocked reason immediately rather than
     * waiting for the next queued-mutation retry.
     */
    reportHealthy: (): void => setBlocked(null),
    /**
     * Symmetric with reportHealthy: a failed read (not just a failed
     * queued mutation) is also "current conditions" and should set the
     * blocked reason immediately, so the pill reflects reality without
     * waiting for a mutation to be queued and attempted.
     */
    reportUnhealthy: (reason: BlockReason): void => setBlocked(reason),
    /**
     * Re-apply every still-queued mutation for `listId` on top of
     * server-fetched todos, so a refetch never overrides a pending local
     * change. Call this on the result of every todos fetch before it
     * reaches the UI.
     */
    reconcileTodos: (listId: string, fresh: TodosResponse): TodosResponse =>
      outbox
        .entries()
        // A queued move concerns *two* lists, so matching only `listId`
        // would skip it when reconciling the target — the moved todo would
        // disappear from the target on any refetch before the outbox
        // drained (docs/specs/todos.md — moving a todo between lists).
        .filter(
          (mutation) =>
            mutation.listId === listId ||
            (mutation.kind === 'moveTodo' && mutation.targetListId === listId),
        )
        // Not point-free: `reduce` passes the element index as the third
        // argument, which would land in `listId`.
        .reduce(
          (cache, mutation) => applyMutationToTodos(cache, mutation, listId),
          fresh,
        ),
    /**
     * Same as `reconcileTodos`, for the lists collection.
     *
     * Sorted here because the server's own order is unusable: Radicale
     * returns collections in filesystem order of their directory names,
     * which are UUIDs — arbitrary, and impossible to predict client-side,
     * so no optimistic insert can match it and a new list always jumped
     * when the response landed. Sorting on read *and* on optimistic insert
     * (applyMutationToLists) means the two always agree
     * (docs/specs/lists.md — ordering).
     */
    reconcileLists: (fresh: TodoList[]): TodoList[] =>
      outbox
        .entries()
        .filter(isListMutation)
        .reduce(applyMutationToLists, fresh)
        .toSorted(byDisplayName),
  }
}
