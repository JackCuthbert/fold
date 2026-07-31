import { memoryStorage, type FatalError } from '@caldav-todo/outbox'
import type { Mutation } from '@caldav-todo/schemas'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { QueryClient } from '@tanstack/react-query'
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
import { useToast } from './toast'

export const api: Api = createApi()

export const queryClient = new QueryClient({
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
      onDropped: (mutation: Mutation, _error: FatalError) => {
        const what =
          mutation.kind === 'updateTodo' || mutation.kind === 'createTodo'
            ? 'a todo change'
            : 'a change'
        toast(`Couldn't save ${what} — it changed on the server`)
      },
    }).then((instance) => {
      if (cancelled) return
      created = instance
      instance.start()
      setEngine(instance)
    })
    return () => {
      cancelled = true
      created?.stop()
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
      persistOptions={{ persister }}
    >
      <EngineContext value={engine}>{children}</EngineContext>
    </PersistQueryClientProvider>
  )
}
