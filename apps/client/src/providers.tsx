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
import { withDeadline } from './lib/deadline'
import {
  createSyncEngine,
  type SyncEngine,
  type SyncStatus,
} from './sync/engine'
import {
  outboxKeyFor,
  readServerIdentity,
  subscribeServerIdentity,
} from './lib/server-identity'
import { openOutboxStorage } from './sync/idb-storage'
import { classifyBlockReason, TaggedFatalError } from './sync/process'
import { useToast } from './ui/toast/toast'

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
      // docs/specs/sync-and-offline.md — status reflects current
      // conditions, never latched history (issue #30).
      //
      // This was `retry: 1`, which gave a read exactly one extra attempt
      // ~1s later and then left the query in `error` for good: a red
      // "Disconnected" dot and a count line stuck as a skeleton, with no
      // path back. The only automatic recovery a permanently-errored query
      // otherwise has is `refetchInterval` — and that is gated on window
      // focus (see `refetchIntervalInBackground` below), so a blip while
      // the tab sat in the background was unrecoverable until the user
      // came back and clicked something.
      //
      // Five attempts on query-core's default backoff (1s, 2s, 4s, 8s,
      // 16s — `defaultRetryDelay`, capped at 30s) spans roughly half a
      // minute of upstream trouble without any interaction. A CalDAV
      // server that is merely slow to serve a freshly-created collection
      // is well inside that; one that is genuinely down still settles into
      // the error state, which is honest, and the interval below then
      // keeps trying.
      retry: 5,
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
      // The interval above is focus-gated by default: query-core only
      // fires it when `focusManager.isFocused()` (queryObserver's
      // `#updateRefetchInterval`), so a backgrounded tab does not poll at
      // all. That is a sensible default for keeping data fresh — nobody is
      // reading an unfocused tab — but it also removes the *only*
      // remaining recovery path for a query that has exhausted its
      // retries, which is what left a blip latched as "Disconnected"
      // forever (issue #30).
      //
      // The cost is one conditional request per list per 45s in a
      // background tab, and the ctag short-circuit makes each a cheap 304
      // (docs/specs/caldav-compliance.md) — worth it to guarantee the app
      // heals itself rather than waiting to be noticed.
      refetchIntervalInBackground: true,
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

const storagePersister = createAsyncStoragePersister({
  storage: {
    getItem: async (key) => (await get<string>(key)) ?? null,
    setItem: (key, value) => set(key, value),
    removeItem: (key) => del(key),
  },
})

// `PersistQueryClientProvider` renders nothing until `restoreClient()`
// settles, and that read goes to IndexedDB — which can hang forever rather
// than reject (docs/specs/sync-and-offline.md — "anything awaited before
// mount needs a deadline"). Without this the whole app is a blank page for
// as long as the database stays wedged.
//
// `undefined` is the persister's own "nothing was persisted" answer, so on
// timeout hydration is simply skipped and we mount with an empty cache.
// That's safe here and nowhere near as costly as it sounds: the client is
// offline-first and refetches on mount, so the only loss is a slower first
// paint, never data. Queued mutations are the outbox's business, not this
// cache's.
export const persister: typeof storagePersister = {
  ...storagePersister,
  restoreClient: () =>
    withDeadline(Promise.resolve(storagePersister.restoreClient()), undefined),
}

// docs/specs/authentication.md — cached data is scoped to its server.
// Nothing in the cache records which server it came from, so signing into a
// different one used to hydrate the previous server's lists and todos from
// IndexedDB and render them under the new credentials. `buster` is
// TanStack Query's own mechanism for exactly this: when the string changes,
// the persisted cache is discarded instead of hydrated.
//
// It has to be read synchronously here, before the first render — which is
// why the identity lives in localStorage rather than being derived from
// `['session']`, a query that is never persisted and has not resolved yet.
// That also makes this cover an *expired* session followed by signing in
// elsewhere, not merely a deliberate sign-out.
const persistOptions = {
  persister,
  dehydrateOptions,
  buster: readServerIdentity() ?? '',
}

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
    case 'setListProps':
      return 'a change'
    default:
      return mutation satisfies never
  }
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [engine, setEngine] = useState<SyncEngine | null>(null)
  const toast = useToast()
  // Signing into a different server *without a reload* must rebuild the
  // engine on that server's queue. Binding the key once at mount would
  // leave it writing to the previous server's outbox — the same
  // cross-server leak this scoping exists to prevent, one layer down.
  const identity = useSyncExternalStore(
    subscribeServerIdentity,
    readServerIdentity,
  )

  useEffect(() => {
    let cancelled = false
    let created: SyncEngine | null = null
    // The outbox's own storage is opened first, and with a deadline: a
    // wedged IndexedDB hangs rather than fails, and everything below waits
    // on it, so without this the app never mounts (issue #17; see
    // openOutboxStorage). A timeout degrades to a store that refuses to
    // write, never to an empty one — the queue is still on disk and
    // overwriting it would destroy queued work.
    const boot = async (): Promise<void> => {
      const { storage, degraded } =
        typeof indexedDB === 'undefined'
          ? { storage: memoryStorage(), degraded: false }
          : // Namespaced per server, so queued writes still survive a
            // logout and replay after re-login
            // (docs/specs/authentication.md) — but only ever against the
            // server they were made for.
            await openOutboxStorage(outboxKeyFor(identity))
      if (cancelled) return
      if (degraded) {
        // The queue on disk couldn't be read, so writes are being refused
        // to avoid overwriting it. Say so plainly: the work is live in
        // this tab and still syncs, but it isn't written down.
        toast(
          "Couldn't read your saved changes — new ones will sync but " +
            "won't survive a reload.",
        )
      }
      const instance = await createSyncEngine({
        api,
        queryClient,
        storage,
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
      })
      if (cancelled) {
        instance.stop()
        return
      }
      created = instance
      syncEngineForQueryHealth = instance
      instance.start()
      setEngine(instance)
    }
    void boot()
    return () => {
      cancelled = true
      created?.stop()
      if (syncEngineForQueryHealth === created) {
        syncEngineForQueryHealth = null
      }
    }
  }, [toast, identity])

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
      persistOptions={persistOptions}
    >
      <EngineContext value={engine}>{children}</EngineContext>
    </PersistQueryClientProvider>
  )
}
