import {
  todoDueSchema,
  todoPrioritySchema,
  type Credentials,
  type NewTodo,
  type Todo,
  type TodoList,
  type TodosResponse,
} from '@fold/schemas'
import { z } from 'zod'
import { CaldavError, CaldavUnreachableError } from './errors'
import type { CaldavGateway, GatewayFactory, ListProps } from './gateway'

/**
 * An in-memory `CaldavGateway`, for the e2e suite's mocked mode.
 *
 * The seam is the BFF's *outbound* edge rather than the browser's: every
 * layer this repo wrote — the router, session sealing, the handlers, error
 * mapping, response validation — still runs, and only tsdav's conversation
 * with a real CalDAV server is replaced (docs/specs/testing.md — the two
 * e2e modes; docs/architecture/e2e-fake-caldav-gateway.md).
 *
 * Never reachable in a production build: `index.ts` imports this module
 * dynamically, only when `CALDAV_FAKE` is on, and `loadConfig` refuses to
 * start when that flag is combined with `NODE_ENV=production`.
 *
 * *(added 2026-08-14, issue #54.)*
 */

/**
 * One CalDAV account's worth of state.
 *
 * Keyed by account rather than global because sessions are sealed and
 * lists/todos are per-user — the suite gives every test its own account
 * (`e2e/tests/helpers.ts` — `currentTestUser`), and sharing one store
 * would reintroduce exactly the cross-test interference that per-account
 * isolation was adopted to remove (docs/specs/testing.md).
 */
interface FakeList {
  id: string
  displayName: string
  color?: string
  order?: number
  ctag: string
  todos: Map<string, FakeTodo>
}

interface FakeTodo {
  uid: string
  summary: string
  completed: boolean
  etag: string
  due?: Todo['due']
  description?: string
  priority?: Todo['priority']
  created?: string
  completedAt?: string
}

/**
 * A staged failure, consumed by the next matching call.
 *
 * `remaining` counts down so a spec can fail exactly N calls and then let
 * the app recover — the shape `recovery.spec.ts` needs from a gateway-side
 * outage. `delayMs` stages a slow response instead of, or alongside, an
 * error.
 */
export interface StagedFault {
  /** Which gateway operations this fault applies to. */
  operations: FaultOperation[]
  /** HTTP status the CalDAV server "answered" with, if any. */
  status?: number
  /** Answer this slowly, in milliseconds. */
  delayMs?: number
  /** How many more matching calls this fault applies to. */
  remaining: number
}

export const FAULT_OPERATIONS = [
  'login',
  'fetchLists',
  'createList',
  'renameList',
  'setListProps',
  'deleteList',
  'fetchTodos',
  'fetchTodo',
  'createTodo',
  'updateTodo',
  'deleteTodo',
] as const

export type FaultOperation = (typeof FAULT_OPERATIONS)[number]

/**
 * A whole account's seed, as the admin route accepts it.
 *
 * Inferred from the schema that validates it rather than declared
 * alongside — a hand-written twin of a zod shape is exactly the
 * duplication CLAUDE.md forbids, and under `exactOptionalPropertyTypes`
 * the two drift apart the moment one gains an optional field.
 */
export const seedTodoSchema = z.object({
  uid: z.string().min(1).optional(),
  summary: z.string().min(1),
  completed: z.boolean().optional(),
  due: todoDueSchema.optional(),
  description: z.string().optional(),
  priority: todoPrioritySchema.optional(),
  created: z.iso.datetime().optional(),
  completedAt: z.iso.datetime().optional(),
})

export const seedListSchema = z.object({
  id: z.string().min(1).optional(),
  displayName: z.string().min(1),
  color: z
    .string()
    .regex(/^#[0-9A-F]{6}$/)
    .optional(),
  order: z.int().optional(),
  todos: z.array(seedTodoSchema).optional(),
})

// Only the list type is exported: it already carries the todo shape
// nested inside it, and a separate `SeedTodo` had no caller.
export type SeedList = z.infer<typeof seedListSchema>

interface Account {
  lists: Map<string, FakeList>
  faults: StagedFault[]
}

/**
 * The whole fake CalDAV "server", shared by every request in the process.
 *
 * A module-level singleton deliberately: the gateway factory is called
 * per request (`AppContext.makeGateway`), so per-instance state would be
 * discarded between the POST that creates a todo and the GET that reads
 * it back.
 */
export class FakeCaldavStore {
  private readonly accounts = new Map<string, Account>()
  private etagCounter = 0

  /**
   * The account key for a set of credentials.
   *
   * Server URL *and* username, matching how a real CalDAV deployment
   * separates collections — two tests that pick the same username against
   * different URLs are still different accounts.
   */
  static keyFor(credentials: Credentials): string {
    return `${credentials.serverUrl}|${credentials.username}`
  }

  private account(key: string): Account {
    const existing = this.accounts.get(key)
    if (existing) return existing
    const created: Account = { lists: new Map(), faults: [] }
    this.accounts.set(key, created)
    return created
  }

  nextEtag(): string {
    this.etagCounter += 1
    return `"fake-etag-${this.etagCounter}"`
  }

  /** Replace an account's contents outright — the seeding entry point. */
  seed(key: string, lists: SeedList[]): void {
    const account = this.account(key)
    account.lists.clear()
    account.faults = []
    for (const [index, list] of lists.entries()) {
      const id = list.id ?? slugify(list.displayName, index)
      const todos = new Map<string, FakeTodo>()
      for (const [todoIndex, todo] of (list.todos ?? []).entries()) {
        const uid = todo.uid ?? `${id}-todo-${todoIndex}`
        todos.set(uid, {
          uid,
          summary: todo.summary,
          completed: todo.completed ?? false,
          etag: this.nextEtag(),
          ...(todo.due !== undefined ? { due: todo.due } : {}),
          ...(todo.description !== undefined
            ? { description: todo.description }
            : {}),
          ...(todo.priority !== undefined ? { priority: todo.priority } : {}),
          ...(todo.created !== undefined ? { created: todo.created } : {}),
          ...(todo.completedAt !== undefined
            ? { completedAt: todo.completedAt }
            : {}),
        })
      }
      account.lists.set(id, {
        id,
        displayName: list.displayName,
        ctag: this.nextEtag(),
        todos,
        ...(list.color !== undefined ? { color: list.color } : {}),
        ...(list.order !== undefined ? { order: list.order } : {}),
      })
    }
  }

  /** Wipe an account back to empty, faults included. */
  reset(key: string): void {
    this.accounts.delete(key)
  }

  stageFault(key: string, fault: StagedFault): void {
    this.account(key).faults.push(fault)
  }

  /**
   * Drop every staged fault — "the server is back".
   *
   * The counterpart to staging one. An outage a test can *end* on demand
   * is what makes recovery observable without tuning a fault count against
   * the outbox's retry schedule, which is precisely the machine-speed
   * dependency a timed outage suffers from (CLAUDE.md — a timed e2e test
   * must not depend on machine speed).
   */
  clearFaults(key: string): void {
    this.account(key).faults = []
  }

  /**
   * Take the next fault that applies to `operation`, if any.
   *
   * Consumed rather than merely read: a fault with `remaining: 1` fires
   * once and then the app is expected to recover, which is the behaviour
   * an outage-and-recovery spec is written against.
   */
  takeFault(key: string, operation: FaultOperation): StagedFault | null {
    const account = this.account(key)
    const index = account.faults.findIndex(
      (fault) => fault.remaining > 0 && fault.operations.includes(operation),
    )
    if (index === -1) return null
    const fault = account.faults[index]
    if (!fault) return null
    fault.remaining -= 1
    if (fault.remaining <= 0) account.faults.splice(index, 1)
    return fault
  }

  lists(key: string): Map<string, FakeList> {
    return this.account(key).lists
  }
}

/** The one store the server process uses. */
export const fakeStore = new FakeCaldavStore()

const slugify = (name: string, index: number): string => {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return slug === '' ? `list-${index}` : slug
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * A gateway backed by `fakeStore`.
 *
 * Throws the same typed errors the tsdav gateway does — `CaldavError` with
 * a status, `CaldavUnreachableError` for "could not reach it at all" — so
 * the router's error mapping (api/router.ts) is exercised for real rather
 * than bypassed.
 */
export const makeFakeGateway: GatewayFactory = (
  credentials: Credentials,
): CaldavGateway => {
  const key = FakeCaldavStore.keyFor(credentials)

  /**
   * Apply any staged fault before doing the real work.
   *
   * A status of 0 (or an explicitly unreachable fault) becomes
   * `CaldavUnreachableError`, which the router maps to the 502 the client
   * treats as "keep the queue" — the same path a genuinely dead CalDAV
   * server takes.
   */
  const guard = async (operation: FaultOperation): Promise<void> => {
    const fault = fakeStore.takeFault(key, operation)
    if (!fault) return
    if (fault.delayMs !== undefined) await delay(fault.delayMs)
    if (fault.status === undefined) return
    if (fault.status === 0) {
      throw new CaldavUnreachableError('fake CalDAV server unreachable')
    }
    throw new CaldavError(fault.status, `staged fault on ${operation}`)
  }

  const requireList = (listId: string): FakeList => {
    const list = fakeStore.lists(key).get(listId)
    if (!list) throw new CaldavError(404, `no such list: ${listId}`)
    return list
  }

  const requireTodo = (listId: string, uid: string): FakeTodo => {
    const todo = requireList(listId).todos.get(uid)
    if (!todo) throw new CaldavError(404, `no such todo: ${uid}`)
    return todo
  }

  /** Bump the collection's ctag — every write to it must invalidate it. */
  const touch = (list: FakeList): void => {
    list.ctag = fakeStore.nextEtag()
  }

  const toTodoList = (list: FakeList): TodoList => ({
    id: list.id,
    href: `${credentials.serverUrl.replace(/\/+$/, '')}/${list.id}/`,
    displayName: list.displayName,
    ctag: list.ctag,
    ...(list.color !== undefined ? { color: list.color } : {}),
    ...(list.order !== undefined ? { order: list.order } : {}),
  })

  const toTodo = (listId: string, todo: FakeTodo): Todo => ({
    uid: todo.uid,
    listId,
    href: `${credentials.serverUrl.replace(/\/+$/, '')}/${listId}/${todo.uid}.ics`,
    etag: todo.etag,
    summary: todo.summary,
    completed: todo.completed,
    ...(todo.due !== undefined ? { due: todo.due } : {}),
    ...(todo.description !== undefined
      ? { description: todo.description }
      : {}),
    ...(todo.priority !== undefined ? { priority: todo.priority } : {}),
    ...(todo.created !== undefined ? { created: todo.created } : {}),
    ...(todo.completedAt !== undefined
      ? { completedAt: todo.completedAt }
      : {}),
  })

  return {
    login: async () => {
      await guard('login')
    },

    fetchLists: async () => {
      await guard('fetchLists')
      return [...fakeStore.lists(key).values()].map(toTodoList)
    },

    createList: async (id: string, displayName: string, props?: ListProps) => {
      await guard('createList')
      const lists = fakeStore.lists(key)
      if (lists.has(id)) throw new CaldavError(409, `list exists: ${id}`)
      const list: FakeList = {
        id,
        displayName,
        ctag: fakeStore.nextEtag(),
        todos: new Map(),
        ...(props?.color != null ? { color: props.color } : {}),
        ...(props?.order != null ? { order: props.order } : {}),
      }
      lists.set(id, list)
      return toTodoList(list)
    },

    renameList: async (listId: string, displayName: string) => {
      await guard('renameList')
      const list = requireList(listId)
      list.displayName = displayName
      touch(list)
    },

    setListProps: async (listId: string, props: ListProps) => {
      await guard('setListProps')
      const list = requireList(listId)
      // `null` clears, a value sets, `undefined` leaves alone — the same
      // three-way contract the real PROPPATCH implements.
      if (props.color === null) delete list.color
      else if (props.color !== undefined) list.color = props.color
      if (props.order === null) delete list.order
      else if (props.order !== undefined) list.order = props.order
      touch(list)
    },

    deleteList: async (listId: string) => {
      await guard('deleteList')
      requireList(listId)
      fakeStore.lists(key).delete(listId)
    },

    fetchTodos: async (
      listId: string,
      knownCtag?: string,
    ): Promise<TodosResponse | null> => {
      await guard('fetchTodos')
      const list = requireList(listId)
      // The ctag short-circuit is real behaviour the client depends on
      // (docs/specs/caldav-compliance.md), so the fake implements it
      // rather than always returning the full collection.
      if (knownCtag !== undefined && knownCtag === list.ctag) return null
      return {
        ctag: list.ctag,
        todos: [...list.todos.values()].map((todo) => toTodo(listId, todo)),
      }
    },

    fetchTodo: async (listId: string, uid: string) => {
      await guard('fetchTodo')
      return toTodo(listId, requireTodo(listId, uid))
    },

    createTodo: async (listId: string, input: NewTodo) => {
      await guard('createTodo')
      const list = requireList(listId)
      // A retried create whose first attempt landed is a 412 upstream, and
      // the handler turns that into the conflict response the outbox knows
      // how to absorb (api/todos/create.ts).
      if (list.todos.has(input.uid)) throw new CaldavError(412)
      const todo: FakeTodo = {
        uid: input.uid,
        summary: input.summary,
        completed: false,
        etag: fakeStore.nextEtag(),
        ...(input.due !== undefined ? { due: input.due } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        created: input.created ?? new Date().toISOString(),
      }
      list.todos.set(todo.uid, todo)
      touch(list)
      return toTodo(listId, todo)
    },

    updateTodo: async (listId, uid, etag, changes) => {
      await guard('updateTodo')
      const list = requireList(listId)
      const todo = requireTodo(listId, uid)
      // ETag precondition, exactly as the real gateway checks it — this is
      // what makes a staged 412 reachable through the ordinary path.
      if (todo.etag !== etag) throw new CaldavError(412)
      if (changes.summary !== undefined) todo.summary = changes.summary
      if (changes.completed !== undefined) {
        todo.completed = changes.completed
        // COMPLETED is written by the server when the todo is finished,
        // and cleared when it is reopened (docs/specs/todos.md).
        if (changes.completed) todo.completedAt = new Date().toISOString()
        else delete todo.completedAt
      }
      if (changes.due === null) delete todo.due
      else if (changes.due !== undefined) todo.due = changes.due
      if (changes.description === null) delete todo.description
      else if (changes.description !== undefined) {
        todo.description = changes.description
      }
      if (changes.priority === null) delete todo.priority
      else if (changes.priority !== undefined) todo.priority = changes.priority
      todo.etag = fakeStore.nextEtag()
      touch(list)
      return toTodo(listId, todo)
    },

    deleteTodo: async (listId: string, uid: string, etag: string) => {
      await guard('deleteTodo')
      const list = requireList(listId)
      const todo = requireTodo(listId, uid)
      if (todo.etag !== etag) throw new CaldavError(412)
      list.todos.delete(uid)
      touch(list)
    },
  }
}
