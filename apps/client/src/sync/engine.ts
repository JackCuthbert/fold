import {
  Outbox,
  SyncLoop,
  type FatalError,
  type OutboxStorage,
} from '@caldav-todo/outbox'
import {
  mutationSchema,
  type Mutation,
  type TodoList,
  type TodosResponse,
} from '@caldav-todo/schemas'
import type { QueryClient } from '@tanstack/react-query'
import type { Api } from '../api/client'
import { coalesceMutations } from './coalesce'
import { applyMutationToLists, applyMutationToTodos } from './optimistic'
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
    status = { ...status, pending }
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

  const process = makeProcessMutation(api, onUnauthorized)
  const loop = new SyncLoop<Mutation>({
    outbox,
    process: async (mutation) => {
      try {
        await process(mutation)
        setBlocked(null)
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
     * Re-apply every still-queued mutation for `listId` on top of
     * server-fetched todos, so a refetch never overrides a pending local
     * change. Call this on the result of every todos fetch before it
     * reaches the UI.
     */
    reconcileTodos: (listId: string, fresh: TodosResponse): TodosResponse =>
      outbox
        .entries()
        .filter((mutation) => mutation.listId === listId)
        .reduce(applyMutationToTodos, fresh),
    /**
     * Same as `reconcileTodos`, for the lists collection.
     */
    reconcileLists: (fresh: TodoList[]): TodoList[] =>
      outbox
        .entries()
        .filter(isListMutation)
        .reduce(applyMutationToLists, fresh),
  }
}
