import {
  Outbox,
  SyncLoop,
  type FatalError,
  type OutboxStorage,
} from '@caldav-todo/outbox'
import { mutationSchema, type Mutation } from '@caldav-todo/schemas'
import type { QueryClient } from '@tanstack/react-query'
import type { Api } from '../api/client'
import { coalesceMutations } from './coalesce'
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

  const invalidateFor = (mutation: Mutation): void => {
    void queryClient.invalidateQueries({
      queryKey: ['todos', mutation.listId],
    })
    if (
      mutation.kind === 'createList' ||
      mutation.kind === 'renameList' ||
      mutation.kind === 'deleteList'
    ) {
      void queryClient.invalidateQueries({ queryKey: ['lists'] })
    }
  }

  const process = makeProcessMutation(api, onUnauthorized)
  const loop = new SyncLoop<Mutation>({
    outbox,
    process: async (mutation) => {
      try {
        await process(mutation)
        setBlocked(null)
        invalidateFor(mutation)
      } catch (error) {
        if (error instanceof TaggedRetryableError) setBlocked(error.reason)
        throw error
      }
    },
    onDrop: (mutation, error) => {
      // Server truth wins: refetch what we failed to change.
      invalidateFor(mutation)
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
  }
}
