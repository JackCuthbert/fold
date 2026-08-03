import { memoryStorage, type FatalError } from '@fold/outbox'
import type { Mutation } from '@fold/schemas'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { QueryCache, QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { del, get, set } from 'idb-keyval'
import {
  createContext,
  use,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { createApi, type Api } from './api/client'
import {
  createSyncEngine,
  type SyncEngine,
  type SyncStatus,
} from './sync/engine'
import { idbStorage } from './sync/idb-storage'
import { classifyBlockReason, TaggedFatalError } from './sync/process'
import { useToast } from './toast'

export const api: Api = createApi()

// Status must reflect current conditions, never latched history
// (docs/specs/sync-and-offline.md). `blocked` would otherwise only ever be
// touched by the outbox's own mutation-processing loop, so it can stay
// stale for as long as the backoff timer between mutation attempts even
// while ordinary reads (getSession/getTodos/getLists) are succeeding or
// failing right now. This holder lets the QueryCache's global hooks below
// reach the engine created later, without restructuring `queryClient`
// (module-level, created before the engine mounts) around it.
let syncEngineForQueryHealth: SyncEngine | null = null

const queryCache = new QueryCache({
  onSuccess: () => syncEngineForQueryHealth?.reportHealthy(),
  onError: (error) => {
    const reason = classifyBlockReason(error)
    if (reason) syncEngineForQueryHealth?.reportUnhealthy(reason)
  },
})

export const queryClient = new QueryClient({
  queryCache,
  defaultOptions: {
    queries: {
      gcTime: 7 * 24 * 60 * 60 * 1000,
      staleTime: 30_000,
      retry: 1,
      networkMode: 'offlineFirst',
      // docs/specs/sync-and-offline.md: refetch on window focus, reconnect,
      // after outbox drain, and on interval. Drain is handled by the sync
      // engine (invalidateQueries once the queue empties); these three
      // cover the "ordinary triggers" so a change made on another device
      // shows up without a reload even while this client sits idle. Every
      // refetch runs through queryFn, which reconciles any still-queued
      // mutation on top of the response, so this can never clobber a
      // pending local change — it's exactly why the ctag/304 short-circuit
      // exists: an idle poll that finds nothing new costs a cheap 304.
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchInterval: 45_000,
    },
  },
})

// Identity lives in the sealed cookie, never in our cache. Persisting
// ['session'] made a reload render the signed-in UI from a stale record
// while the cookie was already gone — empty lists, then a 401 on the first
// write (docs/specs/authentication.md — the session is never served from
// cache). Todos and lists still persist so the app works offline.
const dehydrateOptions = {
  shouldDehydrateQuery: (query: { queryKey: readonly unknown[] }): boolean =>
    query.queryKey[0] !== 'session',
}

const persister = createAsyncStoragePersister({
  storage: {
    getItem: async (key) => (await get<string>(key)) ?? null,
    setItem: (key, value) => set(key, value),
    removeItem: (key) => del(key),
  },
})

const EngineContext = createContext<SyncEngine | null>(null)

export function useSyncEngine(): SyncEngine {
  const engine = use(EngineContext)
  if (!engine) throw new Error('useSyncEngine outside provider')
  return engine
}

export function useSyncStatus(): SyncStatus {
  const engine = useSyncEngine()
  return useSyncExternalStore(engine.subscribe, engine.getStatus)
}

export function usePendingCount(): number {
  return useSyncStatus().pending
}

const subscribeOnline = (onChange: () => void) => {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine)
}

// Best-effort label for the toast — only from data the mutation itself
// carries (no cache reach-through). Falls back to a generic noun when the
// mutation doesn't carry a name (e.g. completing or deleting a todo only
// carries its uid).
const describeMutation = (mutation: Mutation): string => {
  switch (mutation.kind) {
    case 'createTodo':
      return `'${mutation.todo.summary}'`
    case 'updateTodo':
      return mutation.changes.summary
        ? `'${mutation.changes.summary}'`
        : 'a todo change'
    case 'deleteTodo':
      return 'a todo change'
    case 'moveTodo':
      return `'${mutation.todo.summary}'`
    case 'createList':
    case 'renameList':
      return `'${mutation.displayName}'`
    case 'deleteList':
      return 'a change'
    default:
      return mutation satisfies never
  }
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [engine, setEngine] = useState<SyncEngine | null>(null)
  const toast = useToast()

  useEffect(() => {
    let cancelled = false
    let created: SyncEngine | null = null
    void createSyncEngine({
      api,
      queryClient,
      storage:
        typeof indexedDB === 'undefined' ? memoryStorage() : idbStorage(),
      onUnauthorized: () => queryClient.setQueryData(['session'], null),
      onStorageProblem: (message: string) => toast(message),
      onDropped: (mutation: Mutation, error: FatalError) => {
        const what = describeMutation(mutation)
        // Only a genuine 412-after-rebase is a real conflict — say so.
        // Any other fatal drop (docs/specs/sync-and-offline.md) didn't
        // change on the server; saying it did would be false.
        const isConflict =
          error instanceof TaggedFatalError && error.reason === 'conflict'
        toast(
          isConflict
            ? `Couldn't save ${what} — it changed on the server`
            : `Couldn't save ${what}`,
        )
      },
    }).then((instance) => {
      if (cancelled) return
      created = instance
      syncEngineForQueryHealth = instance
      instance.start()
      setEngine(instance)
    })
    return () => {
      cancelled = true
      created?.stop()
      if (syncEngineForQueryHealth === created) {
        syncEngineForQueryHealth = null
      }
    }
  }, [toast])

  useEffect(() => {
    if (!engine) return undefined
    const kick = () => engine.kick()
    window.addEventListener('online', kick)
    window.addEventListener('focus', kick)
    const interval = setInterval(kick, 60_000)
    return () => {
      window.removeEventListener('online', kick)
      window.removeEventListener('focus', kick)
      clearInterval(interval)
    }
  }, [engine])

  if (!engine) return null
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, dehydrateOptions }}
    >
      <EngineContext value={engine}>{children}</EngineContext>
    </PersistQueryClientProvider>
  )
}
