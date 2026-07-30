# Plan 05: React Client

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The React SPA: offline-first sync engine on top of `@caldav-todo/outbox`, TanStack Query persisted to IndexedDB, login, list management, todo pane with micro-interactions, status pills, and completion sound.

**Architecture:** UI renders from the TanStack Query cache only. Actions apply optimistically to the cache and enqueue a `Mutation`; the sync engine drains the outbox against the JSON API, rebasing on 412 per [sync-and-offline](../specs/sync-and-offline.md). Pure logic (sorting, coalescing, cache updates, mutation processing) is unit-tested; rendering is covered by the e2e suite in plan 06 — no duplicated coverage. UI per [ui](../specs/ui.md).

**Tech Stack:** React 19, Vite, @tanstack/react-query (+ persist-client, async-storage-persister), idb-keyval, react-hook-form + @hookform/resolvers, `@caldav-todo/{schemas,outbox}`.

---

### Task 1: `GET /api/session` (server addendum)

The client needs to know who's signed in after a reload. One extra handler
on the server ([authentication](../specs/authentication.md)).

**Files:**
- Create: `apps/server/src/api/session/get.ts`
- Modify: `apps/server/src/api/routes.ts`
- Test: extend `apps/server/test/handlers/session.test.ts`

- [ ] **Step 1: Add the failing test** (append to `session.test.ts`)

```ts
describe('GET /api/session', () => {
  it('returns the session for a valid cookie', async () => {
    const handle = createRouter(routes, testApp())
    const cookie = (await sessionCookie(CREDS, TEST_SECRET, false)).split(
      ';',
    )[0]
    const res = await handle(
      new Request('http://x/api/session', {
        headers: { cookie: cookie ?? '' },
      }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      serverUrl: CREDS.serverUrl,
      username: CREDS.username,
    })
  })

  it('401s without a cookie', async () => {
    const handle = createRouter(routes, testApp())
    const res = await handle(new Request('http://x/api/session'))
    expect(res.status).toBe(401)
  })
})
```

(Import `sessionCookie` and `TEST_SECRET` at the top of the file if not
already there.)

- [ ] **Step 2: Run to verify it fails** — `bun run test -- apps/server`
Expected: FAIL (404).

- [ ] **Step 3: Implement**

`apps/server/src/api/session/get.ts`:

```ts
import { json, requireCredentials, type Route } from '../route'

// GET /api/session — docs/specs/authentication.md
export const getSession: Route = {
  method: 'GET',
  path: '/api/session',
  handle: async (ctx) => {
    const credentials = await requireCredentials(ctx)
    return json({
      serverUrl: credentials.serverUrl,
      username: credentials.username,
    })
  },
}
```

Register `getSession` in `apps/server/src/api/routes.ts`.

- [ ] **Step 4: Run to verify it passes** — `bun run test -- apps/server`

- [ ] **Step 5: Lint, format, commit**

```bash
bun run lint && bun run fmt
git add -A && git commit -m "feat(server): GET /api/session"
```

---

### Task 2: Client scaffold

**Files:**
- Create: `apps/client/package.json`, `apps/client/tsconfig.json`,
  `apps/client/vite.config.ts`, `apps/client/index.html`,
  `apps/client/src/main.tsx`, `apps/client/src/app.tsx`,
  `apps/client/src/styles/app.css` (empty for now)

- [ ] **Step 1: Scaffold**

`apps/client/package.json`:

```json
{
  "name": "@caldav-todo/client",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@caldav-todo/outbox": "workspace:*",
    "@caldav-todo/schemas": "workspace:*",
    "@hookform/resolvers": "^5.0.0",
    "@tanstack/query-async-storage-persister": "^5.0.0",
    "@tanstack/react-query": "^5.0.0",
    "@tanstack/react-query-persist-client": "^5.0.0",
    "idb-keyval": "^6.2.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-hook-form": "^7.50.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@tsconfig/vite-react": "^7.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^5.0.0",
    "typescript": "^7.0.0",
    "vite": "^7.0.0",
    "vitest": "^3.0.0"
  }
}
```

`apps/client/tsconfig.json`:

```json
{
  "extends": [
    "@tsconfig/strictest/tsconfig.json",
    "@tsconfig/vite-react/tsconfig.json"
  ],
  "compilerOptions": { "types": ["vite/client"] },
  "include": ["src", "test"]
}
```

`apps/client/vite.config.ts`:

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:3000' },
  },
})
```

`apps/client/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Todos</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`apps/client/src/main.tsx`:

```tsx
import { createRoot } from 'react-dom/client'
import { App } from './app'
import './styles/app.css'

const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)
```

`apps/client/src/app.tsx` (placeholder until Task 8):

```tsx
export function App() {
  return <p>caldav-todo-client</p>
}
```

- [ ] **Step 2: Verify build + typecheck**

Run: `bun install && bun run --filter @caldav-todo/client build`
Expected: `dist/` produced, no type errors.

- [ ] **Step 3: Lint, format, commit**

```bash
bun run lint && bun run fmt
git add -A && git commit -m "chore(client): vite + react scaffold"
```

---

### Task 3: API wrapper

**Files:**
- Create: `apps/client/src/api/client.ts`, `apps/client/src/api/errors.ts`
- Test: `apps/client/test/api-client.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/client/test/api-client.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApi } from '../src/api/client'
import { ApiError, NetworkError } from '../src/api/errors'

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

afterEach(() => vi.unstubAllGlobals())

describe('api client', () => {
  it('parses valid responses through zod', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([
        { id: 'a', href: '/u/a/', displayName: 'A', ctag: '1' },
      ]),
    )
    vi.stubGlobal('fetch', fetchMock)
    const api = createApi()
    expect(await api.getLists()).toEqual([
      { id: 'a', href: '/u/a/', displayName: 'A', ctag: '1' },
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/lists',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('rejects malformed response bodies', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse([{ nope: true }])),
    )
    await expect(createApi().getLists()).rejects.toThrow()
  })

  it('throws ApiError with status and parsed body on HTTP errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ error: 'conflict', message: 'stale' }, 412),
      ),
    )
    const error = await createApi()
      .renameList('a', 'B')
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    if (error instanceof ApiError) {
      expect(error.status).toBe(412)
      expect(error.body).toMatchObject({ error: 'conflict' })
    }
  })

  it('throws NetworkError when fetch itself rejects (offline)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('failed to fetch')),
    )
    await expect(createApi().getLists()).rejects.toBeInstanceOf(NetworkError)
  })

  it('getTodos returns null on 304 (ctag unchanged)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 304 })),
    )
    expect(await createApi().getTodos('l1', 'ct-1')).toBeNull()
  })

  it('getSession returns null on 401 instead of throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ error: 'unauthorized', message: 'no' }, 401),
      ),
    )
    expect(await createApi().getSession()).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `bun run test -- apps/client`
Expected: FAIL — cannot resolve `../src/api/client`.

- [ ] **Step 3: Implement**

`apps/client/src/api/errors.ts`:

```ts
export class ApiError extends Error {
  override name = 'ApiError'
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`API responded ${status}`)
  }
}

/** fetch itself failed — we are offline or the BFF is down. */
export class NetworkError extends Error {
  override name = 'NetworkError'
}
```

`apps/client/src/api/client.ts`:

```ts
import {
  listsResponseSchema,
  sessionSchema,
  todoListSchema,
  todoSchema,
  todosResponseSchema,
  type Credentials,
  type NewTodo,
  type Session,
  type Todo,
  type TodoChanges,
  type TodoList,
  type TodosResponse,
} from '@caldav-todo/schemas'
import { ApiError, NetworkError } from './errors'

async function call(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
  headers?: Record<string, string>,
): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: {
        ...headers,
        ...(body !== undefined
          ? { 'content-type': 'application/json' }
          : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
  } catch (cause) {
    throw new NetworkError('network request failed', { cause })
  }
  const parsed =
    response.status === 204 ? undefined : await response.json().catch(() => undefined)
  if (!response.ok) throw new ApiError(response.status, parsed)
  return parsed
}

const enc = encodeURIComponent

export function createApi() {
  return {
    login: async (credentials: Credentials): Promise<Session> =>
      sessionSchema.parse(await call('/api/session', 'POST', credentials)),
    logout: async (): Promise<void> => {
      await call('/api/session', 'DELETE')
    },
    getSession: async (): Promise<Session | null> => {
      try {
        return sessionSchema.parse(await call('/api/session', 'GET'))
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null
        throw error
      }
    },
    getLists: async (): Promise<TodoList[]> =>
      listsResponseSchema.parse(await call('/api/lists', 'GET')),
    createList: async (id: string, displayName: string): Promise<TodoList> =>
      todoListSchema.parse(
        await call('/api/lists', 'POST', { id, displayName }),
      ),
    renameList: async (id: string, displayName: string): Promise<void> => {
      await call(`/api/lists/${enc(id)}`, 'PATCH', { displayName })
    },
    deleteList: async (id: string): Promise<void> => {
      await call(`/api/lists/${enc(id)}`, 'DELETE')
    },
    /** `null` = 304, the caller's cached copy is still current. */
    getTodos: async (
      listId: string,
      knownCtag?: string,
    ): Promise<TodosResponse | null> => {
      try {
        return todosResponseSchema.parse(
          await call(
            `/api/lists/${enc(listId)}/todos`,
            'GET',
            undefined,
            knownCtag ? { 'if-none-match': knownCtag } : undefined,
          ),
        )
      } catch (error) {
        if (error instanceof ApiError && error.status === 304) return null
        throw error
      }
    },
    createTodo: async (listId: string, todo: NewTodo): Promise<Todo> =>
      todoSchema.parse(
        await call(`/api/lists/${enc(listId)}/todos`, 'POST', todo),
      ),
    updateTodo: async (
      listId: string,
      uid: string,
      etag: string,
      changes: TodoChanges,
    ): Promise<Todo> =>
      todoSchema.parse(
        await call(`/api/lists/${enc(listId)}/todos/${enc(uid)}`, 'PUT', {
          etag,
          changes,
        }),
      ),
    deleteTodo: async (
      listId: string,
      uid: string,
      etag: string,
    ): Promise<void> => {
      await call(`/api/lists/${enc(listId)}/todos/${enc(uid)}`, 'DELETE', {
        etag,
      })
    },
  }
}

export type Api = ReturnType<typeof createApi>
```

- [ ] **Step 4: Run to verify it passes** — `bun run test -- apps/client`

- [ ] **Step 5: Lint, format, commit**

```bash
bun run lint && bun run fmt
git add -A && git commit -m "feat(client): typed api wrapper"
```

---

### Task 4: Coalescing rules

Rules per [sync-and-offline](../specs/sync-and-offline.md): merge
update-into-update, merge update-into-create, cancel create+delete; list
rename merges into list create; list delete cancels its create and drops
that list's queued todo mutations.

**Files:**
- Create: `apps/client/src/sync/coalesce.ts`
- Test: `apps/client/test/coalesce.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/client/test/coalesce.test.ts`:

```ts
import type { Mutation } from '@caldav-todo/schemas'
import { describe, expect, it } from 'vitest'
import { coalesceMutations } from '../src/sync/coalesce'

let n = 0
const id = () => `00000000-0000-4000-8000-${String(n++).padStart(12, '0')}`

const createTodo = (uid: string): Mutation => ({
  id: id(),
  kind: 'createTodo',
  listId: 'l1',
  todo: { uid, summary: 'new' },
})
const updateTodo = (
  uid: string,
  changes: Record<string, unknown>,
): Mutation =>
  ({
    id: id(),
    kind: 'updateTodo',
    listId: 'l1',
    uid,
    etag: 'e1',
    changes,
  }) as Mutation
const deleteTodo = (uid: string): Mutation => ({
  id: id(),
  kind: 'deleteTodo',
  listId: 'l1',
  uid,
  etag: 'e1',
})

const run = (queue: Mutation[], incoming: Mutation): Mutation[] =>
  coalesceMutations(queue, incoming)

describe('coalesceMutations', () => {
  it('merges consecutive updates to the same todo', () => {
    const queue = run([updateTodo('a', { summary: 'x' })], updateTodo('a', {
      completed: true,
    }))
    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({
      kind: 'updateTodo',
      changes: { summary: 'x', completed: true },
    })
  })

  it('later update fields win when merging', () => {
    const queue = run([updateTodo('a', { summary: 'old' })], updateTodo('a', {
      summary: 'new',
    }))
    expect(queue[0]).toMatchObject({ changes: { summary: 'new' } })
  })

  it('folds an update into a pending create', () => {
    const queue = run([createTodo('a')], updateTodo('a', { summary: 'z' }))
    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({
      kind: 'createTodo',
      todo: { uid: 'a', summary: 'z' },
    })
  })

  it('cancels a pending create when the todo is deleted', () => {
    const queue = run([createTodo('a'), updateTodo('a', { summary: 'x' })],
      deleteTodo('a'))
    expect(queue).toHaveLength(0)
  })

  it('keeps a delete for a todo that exists on the server', () => {
    const queue = run([], deleteTodo('a'))
    expect(queue).toHaveLength(1)
  })

  it('does not touch mutations for other todos or lists', () => {
    const other = updateTodo('b', { summary: 'keep' })
    const queue = run([other], updateTodo('a', { summary: 'x' }))
    expect(queue).toHaveLength(2)
  })

  it('deleteList cancels its create and drops queued todo mutations', () => {
    const createList: Mutation = {
      id: id(),
      kind: 'createList',
      listId: 'l1',
      displayName: 'L',
    }
    const queue = run(
      [createList, createTodo('a')],
      { id: id(), kind: 'deleteList', listId: 'l1' },
    )
    expect(queue).toHaveLength(0)
  })

  it('renameList merges into a pending createList', () => {
    const createList: Mutation = {
      id: id(),
      kind: 'createList',
      listId: 'l1',
      displayName: 'Old',
    }
    const queue = run([createList], {
      id: id(),
      kind: 'renameList',
      listId: 'l1',
      displayName: 'New',
    })
    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({ kind: 'createList', displayName: 'New' })
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `bun run test -- apps/client`

- [ ] **Step 3: Implement**

`apps/client/src/sync/coalesce.ts`:

```ts
import type { Mutation } from '@caldav-todo/schemas'

// Coalescing rules — docs/specs/sync-and-offline.md (sync loop).
export function coalesceMutations(
  queue: readonly Mutation[],
  incoming: Mutation,
): Mutation[] {
  if (incoming.kind === 'updateTodo') {
    const index = queue.findIndex(
      (m) =>
        (m.kind === 'updateTodo' || m.kind === 'createTodo') &&
        m.listId === incoming.listId &&
        (m.kind === 'createTodo' ? m.todo.uid : m.uid) === incoming.uid,
    )
    const target = index === -1 ? undefined : queue[index]
    if (target?.kind === 'updateTodo') {
      const merged: Mutation = {
        ...target,
        changes: { ...target.changes, ...incoming.changes },
      }
      return queue.map((m, i) => (i === index ? merged : m))
    }
    if (target?.kind === 'createTodo') {
      const { completed: _completed, ...fields } = incoming.changes
      const merged: Mutation = {
        ...target,
        todo: {
          ...target.todo,
          ...(fields.summary !== undefined ? { summary: fields.summary } : {}),
          ...(fields.due != null ? { due: fields.due } : {}),
          ...(fields.description != null
            ? { description: fields.description }
            : {}),
          ...(fields.priority != null ? { priority: fields.priority } : {}),
        },
      }
      return queue.map((m, i) => (i === index ? merged : m))
    }
    return [...queue, incoming]
  }

  if (incoming.kind === 'deleteTodo') {
    const hadPendingCreate = queue.some(
      (m) =>
        m.kind === 'createTodo' &&
        m.listId === incoming.listId &&
        m.todo.uid === incoming.uid,
    )
    const remaining = queue.filter((m) => {
      if (m.listId !== incoming.listId) return true
      if (m.kind === 'createTodo') return m.todo.uid !== incoming.uid
      if (m.kind === 'updateTodo') return m.uid !== incoming.uid
      return true
    })
    // Never synced? Nothing to delete on the server.
    return hadPendingCreate ? remaining : [...remaining, incoming]
  }

  if (incoming.kind === 'renameList') {
    const index = queue.findIndex(
      (m) => m.kind === 'createList' && m.listId === incoming.listId,
    )
    if (index !== -1) {
      return queue.map((m, i) =>
        i === index && m.kind === 'createList'
          ? { ...m, displayName: incoming.displayName }
          : m,
      )
    }
    return [...queue, incoming]
  }

  if (incoming.kind === 'deleteList') {
    const hadPendingCreate = queue.some(
      (m) => m.kind === 'createList' && m.listId === incoming.listId,
    )
    const remaining = queue.filter((m) => m.listId !== incoming.listId)
    return hadPendingCreate ? remaining : [...remaining, incoming]
  }

  return [...queue, incoming]
}
```

- [ ] **Step 4: Run to verify it passes** — `bun run test -- apps/client`

- [ ] **Step 5: Lint, format, commit**

```bash
bun run lint && bun run fmt
git add -A && git commit -m "feat(client): mutation coalescing"
```

---

### Task 5: Sorting + optimistic cache updates

**Files:**
- Create: `apps/client/src/todos/sort.ts`, `apps/client/src/sync/optimistic.ts`
- Test: `apps/client/test/sort.test.ts`, `apps/client/test/optimistic.test.ts`

- [ ] **Step 1: Write the failing tests**

`apps/client/test/sort.test.ts`:

```ts
import type { Todo } from '@caldav-todo/schemas'
import { describe, expect, it } from 'vitest'
import { dueInstant, isOverdue, sortActiveTodos } from '../src/todos/sort'

const NOW = new Date('2026-07-30T12:00:00Z')
const todo = (uid: string, extra: Partial<Todo> = {}): Todo => ({
  uid,
  listId: 'l',
  href: `/${uid}`,
  etag: 'e',
  summary: uid,
  completed: false,
  ...extra,
})

describe('sortActiveTodos', () => {
  it('orders: overdue, then due date, then priority, then stable', () => {
    const items = [
      todo('no-due'),
      todo('due-later', { due: { kind: 'date', value: '2026-09-01' } }),
      todo('overdue', { due: { kind: 'date', value: '2026-07-01' } }),
      todo('high', { priority: 'high' }),
      todo('due-soon', { due: { kind: 'date', value: '2026-08-01' } }),
    ]
    expect(sortActiveTodos(items, NOW).map((t) => t.uid)).toEqual([
      'overdue',
      'due-soon',
      'due-later',
      'high',
      'no-due',
    ])
  })

  it('date-only due is overdue only after the whole day has passed', () => {
    expect(
      isOverdue(todo('t', { due: { kind: 'date', value: '2026-07-30' } }), NOW),
    ).toBe(false)
    expect(
      isOverdue(todo('t', { due: { kind: 'date', value: '2026-07-29' } }), NOW),
    ).toBe(true)
  })

  it('orders the four due forms by their resolved instant', () => {
    // All four resolve near the same moment; ordering must be stable and
    // must not throw on an unknown zone.
    const items = [
      todo('utc', { due: { kind: 'utc', value: '2026-08-02T00:00:00.000Z' } }),
      todo('floating', { due: { kind: 'floating', value: '2026-08-01T12:00:00' } }),
      todo('zoned', {
        due: {
          kind: 'zoned',
          tzid: 'Australia/Brisbane',
          value: '2026-08-01T12:00:00',
        },
      }),
      todo('unknown-zone', {
        due: { kind: 'zoned', tzid: 'Nowhere/Unknown', value: '2026-08-01T12:00:00' },
      }),
    ]
    const sorted = sortActiveTodos(items, NOW)
    expect(sorted).toHaveLength(4)
    // Each resolved instant must be finite — no NaN leaking into the sort.
    for (const item of sorted) {
      expect(Number.isNaN(dueInstant(item))).toBe(false)
    }
  })
})
```

`apps/client/test/optimistic.test.ts`:

```ts
import type { Mutation, TodosResponse } from '@caldav-todo/schemas'
import { describe, expect, it } from 'vitest'
import { applyMutationToLists, applyMutationToTodos } from '../src/sync/optimistic'

const CACHE: TodosResponse = {
  ctag: 'c1',
  todos: [
    {
      uid: 'a',
      listId: 'l1',
      href: '/a',
      etag: 'e1',
      summary: 'A',
      completed: false,
      due: { kind: 'date', value: '2026-08-01' },
    },
  ],
}

describe('applyMutationToTodos', () => {
  it('appends a placeholder for createTodo', () => {
    const mutation: Mutation = {
      id: '00000000-0000-4000-8000-000000000001',
      kind: 'createTodo',
      listId: 'l1',
      todo: { uid: 'b', summary: 'B' },
    }
    const next = applyMutationToTodos(CACHE, mutation)
    expect(next.todos.map((t) => t.uid)).toEqual(['a', 'b'])
    expect(next.todos[1]).toMatchObject({ summary: 'B', completed: false })
  })

  it('merges changes and clears nulled fields for updateTodo', () => {
    const mutation: Mutation = {
      id: '00000000-0000-4000-8000-000000000002',
      kind: 'updateTodo',
      listId: 'l1',
      uid: 'a',
      etag: 'e1',
      changes: { completed: true, due: null },
    }
    const next = applyMutationToTodos(CACHE, mutation)
    expect(next.todos[0]).toMatchObject({ completed: true })
    expect(next.todos[0]?.due).toBeUndefined()
  })

  it('removes the todo for deleteTodo', () => {
    const mutation: Mutation = {
      id: '00000000-0000-4000-8000-000000000003',
      kind: 'deleteTodo',
      listId: 'l1',
      uid: 'a',
      etag: 'e1',
    }
    expect(applyMutationToTodos(CACHE, mutation).todos).toHaveLength(0)
  })
})

describe('applyMutationToLists', () => {
  const lists = [{ id: 'l1', href: '/l1/', displayName: 'One', ctag: 'c' }]

  it('appends createList, renames renameList, removes deleteList', () => {
    const created = applyMutationToLists(lists, {
      id: '00000000-0000-4000-8000-000000000004',
      kind: 'createList',
      listId: 'l2',
      displayName: 'Two',
    })
    expect(created.map((l) => l.id)).toEqual(['l1', 'l2'])

    const renamed = applyMutationToLists(lists, {
      id: '00000000-0000-4000-8000-000000000005',
      kind: 'renameList',
      listId: 'l1',
      displayName: 'Uno',
    })
    expect(renamed[0]?.displayName).toBe('Uno')

    const removed = applyMutationToLists(lists, {
      id: '00000000-0000-4000-8000-000000000006',
      kind: 'deleteList',
      listId: 'l1',
    })
    expect(removed).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run to verify they fail** — `bun run test -- apps/client`

- [ ] **Step 3: Implement**

`apps/client/src/todos/sort.ts`:

```ts
import type { Todo } from '@caldav-todo/schemas'

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const

// Resolve each DUE form to a comparison instant in the VIEWER's timezone —
// docs/specs/todos.md#ordering-and-overdue-comparison. Display only; this
// is never written back to the server.
const zonedOffsetMs = (local: string, tzid: string): number => {
  try {
    const asUtc = new Date(`${local}Z`)
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tzid,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    const parts = Object.fromEntries(
      formatter.formatToParts(asUtc).map((part) => [part.type, part.value]),
    )
    const shown = Date.parse(
      `${parts['year']}-${parts['month']}-${parts['day']}` +
        `T${parts['hour'] === '24' ? '00' : parts['hour']}:` +
        `${parts['minute']}:${parts['second']}Z`,
    )
    return asUtc.getTime() - shown
  } catch {
    // Unknown zone: treat as floating.
    return 0
  }
}

export const dueInstant = (todo: Todo): number => {
  const due = todo.due
  if (!due) return Number.POSITIVE_INFINITY
  switch (due.kind) {
    case 'date': {
      // An all-day todo isn't overdue until the local day is over.
      const [year, month, day] = due.value.split('-').map(Number)
      return new Date(
        year ?? 0,
        (month ?? 1) - 1,
        day ?? 1,
        23,
        59,
        59,
        999,
      ).getTime()
    }
    case 'utc':
      return new Date(due.value).getTime()
    case 'floating':
      // "9am wherever you are" — parse without a zone suffix so the
      // runtime applies local time.
      return new Date(due.value).getTime()
    case 'zoned':
      return (
        new Date(`${due.value}Z`).getTime() +
        zonedOffsetMs(due.value, due.tzid)
      )
  }
}

export const isOverdue = (todo: Todo, now: Date): boolean =>
  dueInstant(todo) < now.getTime()

// Sort order per docs/specs/todos.md: overdue, due date, priority, stable.
export function sortActiveTodos(todos: readonly Todo[], now: Date): Todo[] {
  return [...todos].sort((a, b) => {
    const overdue = Number(isOverdue(b, now)) - Number(isOverdue(a, now))
    if (overdue !== 0) return overdue
    const due = dueInstant(a) - dueInstant(b)
    if (due !== 0) return due
    const priority =
      PRIORITY_RANK[a.priority ?? 'low'] - PRIORITY_RANK[b.priority ?? 'low']
    if (priority !== 0 && (a.priority || b.priority)) return priority
    return 0
  })
}
```

`apps/client/src/sync/optimistic.ts`:

```ts
import type {
  Mutation,
  Todo,
  TodoList,
  TodosResponse,
} from '@caldav-todo/schemas'

// Optimistic cache updates — docs/specs/sync-and-offline.md (writes).
export function applyMutationToTodos(
  cache: TodosResponse,
  mutation: Mutation,
): TodosResponse {
  switch (mutation.kind) {
    case 'createTodo': {
      const placeholder: Todo = {
        ...mutation.todo,
        listId: mutation.listId,
        href: '',
        etag: '',
        completed: false,
      }
      return { ...cache, todos: [...cache.todos, placeholder] }
    }
    case 'updateTodo':
      return {
        ...cache,
        todos: cache.todos.map((todo) => {
          if (todo.uid !== mutation.uid) return todo
          const { due, description, priority, ...rest } = mutation.changes
          const next: Todo = { ...todo, ...rest }
          if (due !== undefined) {
            if (due === null) delete next.due
            else next.due = due
          }
          if (description !== undefined) {
            if (description === null) delete next.description
            else next.description = description
          }
          if (priority !== undefined) {
            if (priority === null) delete next.priority
            else next.priority = priority
          }
          return next
        }),
      }
    case 'deleteTodo':
      return {
        ...cache,
        todos: cache.todos.filter((todo) => todo.uid !== mutation.uid),
      }
    default:
      return cache
  }
}

export function applyMutationToLists(
  lists: readonly TodoList[],
  mutation: Mutation,
): TodoList[] {
  switch (mutation.kind) {
    case 'createList':
      return [
        ...lists,
        {
          id: mutation.listId,
          href: '',
          displayName: mutation.displayName,
          ctag: '',
        },
      ]
    case 'renameList':
      return lists.map((list) =>
        list.id === mutation.listId
          ? { ...list, displayName: mutation.displayName }
          : list,
      )
    case 'deleteList':
      return lists.filter((list) => list.id !== mutation.listId)
    default:
      return [...lists]
  }
}
```

- [ ] **Step 4: Run to verify they pass** — `bun run test -- apps/client`

- [ ] **Step 5: Lint, format, commit**

```bash
bun run lint && bun run fmt
git add -A && git commit -m "feat(client): sorting and optimistic cache updates"
```

---

### Task 6: `processMutation` — API dispatch + 412 rebase

**Files:**
- Create: `apps/client/src/sync/process.ts`
- Test: `apps/client/test/process.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/client/test/process.test.ts`:

```ts
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

const fakeApi = (overrides: Partial<Api>): Api =>
  ({
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
  }) as Api

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
    const process = makeProcessMutation(
      fakeApi({ updateTodo }),
      onUnauthorized,
    )
    await expect(process(update)).rejects.toBeInstanceOf(RetryableError)
    expect(onUnauthorized).toHaveBeenCalled()
  })

  it('maps other statuses (client bugs) to FatalError', async () => {
    const updateTodo = vi.fn().mockRejectedValue(new ApiError(400, {}))
    const process = makeProcessMutation(fakeApi({ updateTodo }), vi.fn())
    await expect(process(update)).rejects.toBeInstanceOf(FatalError)
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `bun run test -- apps/client`

- [ ] **Step 3: Implement**

`apps/client/src/sync/process.ts`:

```ts
import { FatalError, RetryableError } from '@caldav-todo/outbox'
import { conflictResponseSchema, type Mutation } from '@caldav-todo/schemas'
import type { Api } from '../api/client'
import { ApiError, NetworkError } from '../api/errors'

// Drain-side mutation processing with LWW conflict rebase —
// docs/specs/sync-and-offline.md (conflict handling).
export function makeProcessMutation(
  api: Api,
  onUnauthorized: () => void,
): (mutation: Mutation) => Promise<void> {
  const dispatch = async (mutation: Mutation, etagOverride?: string) => {
    switch (mutation.kind) {
      case 'createTodo':
        await api.createTodo(mutation.listId, mutation.todo)
        return
      case 'updateTodo':
        await api.updateTodo(
          mutation.listId,
          mutation.uid,
          etagOverride ?? mutation.etag,
          mutation.changes,
        )
        return
      case 'deleteTodo':
        await api.deleteTodo(
          mutation.listId,
          mutation.uid,
          etagOverride ?? mutation.etag,
        )
        return
      case 'createList':
        await api.createList(mutation.listId, mutation.displayName)
        return
      case 'renameList':
        await api.renameList(mutation.listId, mutation.displayName)
        return
      case 'deleteList':
        await api.deleteList(mutation.listId)
        return
    }
  }

  const freshEtag = (error: ApiError): string | null => {
    const parsed = conflictResponseSchema.safeParse(error.body)
    return parsed.success ? parsed.data.todo.etag : null
  }

  return async (mutation) => {
    try {
      await dispatch(mutation)
    } catch (error) {
      if (error instanceof NetworkError) {
        throw new RetryableError('offline', { cause: error })
      }
      if (!(error instanceof ApiError)) throw error
      if (error.status === 502) {
        throw new RetryableError('caldav server unreachable', { cause: error })
      }
      if (error.status === 401) {
        onUnauthorized()
        throw new RetryableError('unauthorized', { cause: error })
      }
      if (
        error.status === 412 &&
        (mutation.kind === 'updateTodo' || mutation.kind === 'deleteTodo')
      ) {
        const etag = freshEtag(error)
        if (etag) {
          try {
            await dispatch(mutation, etag)
            return
          } catch (retryError) {
            throw new FatalError('conflict after rebase', {
              cause: retryError,
            })
          }
        }
      }
      throw new FatalError(`unrecoverable API error ${error.status}`, {
        cause: error,
      })
    }
  }
}
```

- [ ] **Step 4: Run to verify it passes** — `bun run test -- apps/client`

- [ ] **Step 5: Lint, format, commit**

```bash
bun run lint && bun run fmt
git add -A && git commit -m "feat(client): mutation processing with 412 rebase"
```

---

### Task 7: Sync engine

Wires Outbox + SyncLoop + processMutation + TanStack Query invalidation into
one object the UI consumes via context.

**Files:**
- Create: `apps/client/src/sync/engine.ts`, `apps/client/src/sync/idb-storage.ts`
- Test: `apps/client/test/engine.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/client/test/engine.test.ts`:

```ts
import { memoryStorage } from '@caldav-todo/outbox'
import type { Mutation } from '@caldav-todo/schemas'
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { Api } from '../src/api/client'
import { NetworkError } from '../src/api/errors'
import { createSyncEngine } from '../src/sync/engine'

const mutation: Mutation = {
  id: '00000000-0000-4000-8000-000000000001',
  kind: 'createTodo',
  listId: 'l1',
  todo: { uid: 'a', summary: 'A' },
}

const fakeApi = (overrides: Partial<Api>): Api =>
  ({ createTodo: vi.fn() }) as unknown as Api & typeof overrides

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
    })
    const seen: number[] = []
    engine.subscribe((status) => seen.push(status.pending))
    engine.start()
    await engine.enqueue(mutation)
    await vi.waitFor(() => expect(createTodo).toHaveBeenCalled())
    expect(seen.at(-1)).toBe(1)
    engine.stop()
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `bun run test -- apps/client`

- [ ] **Step 3: Implement**

`apps/client/src/sync/idb-storage.ts`:

```ts
import type { OutboxStorage } from '@caldav-todo/outbox'
import { get, set } from 'idb-keyval'

export function idbStorage(key = 'caldav-todo-outbox'): OutboxStorage {
  return {
    load: async () => (await get<unknown[]>(key)) ?? [],
    save: (entries) => set(key, [...entries]),
  }
}
```

`apps/client/src/sync/engine.ts`:

```ts
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
import { makeProcessMutation } from './process'

export interface SyncStatus {
  pending: number
}

export interface SyncEngineOptions {
  api: Api
  queryClient: QueryClient
  storage: OutboxStorage
  onUnauthorized: () => void
  onDropped: (mutation: Mutation, error: FatalError) => void
}

export type SyncEngine = Awaited<ReturnType<typeof createSyncEngine>>

export async function createSyncEngine(options: SyncEngineOptions) {
  const { api, queryClient, storage, onUnauthorized, onDropped } = options
  const listeners = new Set<(status: SyncStatus) => void>()
  let status: SyncStatus = { pending: 0 }

  const notify = (pending: number): void => {
    status = { pending }
    for (const listener of listeners) listener(status)
  }

  const outbox = await Outbox.open<Mutation>({
    storage,
    parse: (raw) => {
      const parsed = mutationSchema.safeParse(raw)
      return parsed.success ? parsed.data : null
    },
    coalesce: coalesceMutations,
    onChange: notify,
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
      await process(mutation)
      invalidateFor(mutation)
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
```

- [ ] **Step 4: Run to verify it passes** — `bun run test -- apps/client`

- [ ] **Step 5: Lint, format, commit**

```bash
bun run lint && bun run fmt
git add -A && git commit -m "feat(client): sync engine"
```

---

### Task 8: App shell — providers, session, login

**Files:**
- Create: `apps/client/src/app.tsx` (replace placeholder),
  `apps/client/src/providers.tsx`, `apps/client/src/auth/login-screen.tsx`,
  `apps/client/src/toast.tsx`

- [ ] **Step 1: Implement**

`apps/client/src/providers.tsx`:

```tsx
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
import { createSyncEngine, type SyncEngine } from './sync/engine'
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
    },
  },
})

const persister = createAsyncStoragePersister({
  storage: {
    getItem: async (key) => ((await get<string>(key)) ?? null),
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

export function usePendingCount(): number {
  const engine = useSyncEngine()
  return useSyncExternalStore(
    engine.subscribe,
    () => engine.getStatus().pending,
  )
}

export function useOnline(): boolean {
  const subscribe = (onChange: () => void) => {
    window.addEventListener('online', onChange)
    window.addEventListener('offline', onChange)
    return () => {
      window.removeEventListener('online', onChange)
      window.removeEventListener('offline', onChange)
    }
  }
  return useSyncExternalStore(subscribe, () => navigator.onLine)
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
      onUnauthorized: () =>
        queryClient.setQueryData(['session'], null),
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
    if (!engine) return
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
```

`apps/client/src/toast.tsx`:

```tsx
import {
  createContext,
  use,
  useCallback,
  useRef,
  useState,
  type ReactNode,
} from 'react'

interface ToastEntry {
  id: number
  message: string
}

const ToastContext = createContext<(message: string) => void>(() => {})

export const useToast = () => use(ToastContext)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const nextId = useRef(0)

  const push = useCallback((message: string) => {
    const id = nextId.current++
    setToasts((current) => [...current, { id, message }])
    setTimeout(() => {
      setToasts((current) => current.filter((entry) => entry.id !== id))
    }, 5000)
  }, [])

  return (
    <ToastContext value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((entry) => (
          <div key={entry.id} className="toast">
            {entry.message}
          </div>
        ))}
      </div>
    </ToastContext>
  )
}
```

`apps/client/src/auth/login-screen.tsx`:

```tsx
import { credentialsSchema, type Credentials } from '@caldav-todo/schemas'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { api, queryClient } from '../providers'
import { ApiError } from '../api/errors'

// docs/specs/authentication.md — login form, react-hook-form + zod.
export function LoginScreen() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Credentials>({ resolver: zodResolver(credentialsSchema) })

  const login = useMutation({
    mutationFn: api.login,
    onSuccess: (session) => queryClient.setQueryData(['session'], session),
  })

  const submitError =
    login.error instanceof ApiError && login.error.status === 401
      ? 'The CalDAV server rejected these credentials.'
      : login.error
        ? 'Could not reach the server. Check the URL and try again.'
        : null

  return (
    <main className="login">
      <h1>Todos</h1>
      <p className="login__hint">Sign in to your CalDAV server</p>
      <form
        onSubmit={handleSubmit((credentials) => login.mutate(credentials))}
        noValidate
      >
        <label>
          Server URL
          <input
            type="url"
            placeholder="https://dav.example.com/username/"
            autoComplete="url"
            {...register('serverUrl')}
          />
          {errors.serverUrl && <span role="alert">Enter a valid URL</span>}
        </label>
        <label>
          Username
          <input autoComplete="username" {...register('username')} />
          {errors.username && <span role="alert">Required</span>}
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            {...register('password')}
          />
          {errors.password && <span role="alert">Required</span>}
        </label>
        {submitError && (
          <p className="login__error" role="alert">
            {submitError}
          </p>
        )}
        <button type="submit" disabled={isSubmitting || login.isPending}>
          Sign in
        </button>
      </form>
    </main>
  )
}
```

`apps/client/src/app.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query'
import { LoginScreen } from './auth/login-screen'
import { MainScreen } from './main-screen'
import { api, AppProviders } from './providers'
import { ToastProvider } from './toast'

function Gate() {
  const session = useQuery({
    queryKey: ['session'],
    queryFn: api.getSession,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  })
  if (session.isLoading) return null
  return session.data ? <MainScreen /> : <LoginScreen />
}

export function App() {
  return (
    <ToastProvider>
      <AppProviders>
        <Gate />
      </AppProviders>
    </ToastProvider>
  )
}
```

Create a stub `apps/client/src/main-screen.tsx` (replaced in Task 9):

```tsx
export function MainScreen() {
  return <p>signed in</p>
}
```

- [ ] **Step 2: Verify** — `bun run --filter @caldav-todo/client typecheck && bun run --filter @caldav-todo/client build`
Expected: clean. (If `zodResolver` type-errors with zod v4, switch to
`standardSchemaResolver` from `@hookform/resolvers/standard-schema` — zod v4
implements Standard Schema. Behavior is identical.)

- [ ] **Step 3: Lint, format, commit**

```bash
bun run lint && bun run fmt
git add -A && git commit -m "feat(client): app shell, providers, login"
```

---

### Task 9: Main screen — lists sidebar/drawer + header pills

**Files:**
- Create: `apps/client/src/main-screen.tsx` (replace stub),
  `apps/client/src/lists/list-nav.tsx`, `apps/client/src/header.tsx`,
  `apps/client/src/confirm.tsx`, `apps/client/src/lists/list-form.tsx`

- [ ] **Step 1: Implement**

`apps/client/src/confirm.tsx`:

```tsx
import { useRef, type ReactNode } from 'react'

export function ConfirmDialog(props: {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  if (props.open && ref.current && !ref.current.open) ref.current.showModal()
  if (!props.open && ref.current?.open) ref.current.close()
  return (
    <dialog ref={ref} className="confirm" onCancel={props.onCancel}>
      <h2>{props.title}</h2>
      <div>{props.children}</div>
      <div className="confirm__actions">
        <button type="button" onClick={props.onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="confirm__danger"
          onClick={props.onConfirm}
        >
          {props.confirmLabel}
        </button>
      </div>
    </dialog>
  )
}
```

`apps/client/src/lists/list-form.tsx` (create + rename share it):

```tsx
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

const listFormSchema = z.object({ displayName: z.string().min(1) })
type ListForm = z.infer<typeof listFormSchema>

export function ListNameForm(props: {
  initial?: string
  submitLabel: string
  onSubmit: (displayName: string) => void
  onCancel: () => void
}) {
  const { register, handleSubmit } = useForm<ListForm>({
    resolver: zodResolver(listFormSchema),
    defaultValues: { displayName: props.initial ?? '' },
  })
  return (
    <form
      className="list-form"
      onSubmit={handleSubmit((values) => props.onSubmit(values.displayName))}
    >
      <input autoFocus placeholder="List name" {...register('displayName')} />
      <button type="submit">{props.submitLabel}</button>
      <button type="button" onClick={props.onCancel}>
        Cancel
      </button>
    </form>
  )
}
```

`apps/client/src/lists/list-nav.tsx`:

```tsx
import type { TodoList } from '@caldav-todo/schemas'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api, queryClient, useSyncEngine } from '../providers'
import { applyMutationToLists } from '../sync/optimistic'
import { ConfirmDialog } from '../confirm'
import { ListNameForm } from './list-form'

const slug = (): string => crypto.randomUUID()

export function useLists() {
  return useQuery({ queryKey: ['lists'], queryFn: api.getLists })
}

// docs/specs/lists.md — discover/create/rename/delete.
export function ListNav(props: {
  selected: string | null
  onSelect: (listId: string) => void
}) {
  const engine = useSyncEngine()
  const lists = useLists()
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<TodoList | null>(null)
  const [deleting, setDeleting] = useState<TodoList | null>(null)

  const mutate = (
    mutation: Parameters<typeof applyMutationToLists>[1],
  ): void => {
    queryClient.setQueryData<TodoList[]>(['lists'], (current) =>
      applyMutationToLists(current ?? [], mutation),
    )
    void engine.enqueue(mutation)
  }

  return (
    <nav className="list-nav" aria-label="Lists">
      <ul>
        {(lists.data ?? []).map((list) => (
          <li key={list.id}>
            <button
              type="button"
              className={
                list.id === props.selected
                  ? 'list-nav__item list-nav__item--active'
                  : 'list-nav__item'
              }
              onClick={() => props.onSelect(list.id)}
            >
              {list.displayName}
            </button>
            <button
              type="button"
              className="list-nav__action"
              aria-label={`Rename ${list.displayName}`}
              onClick={() => setRenaming(list)}
            >
              ✎
            </button>
            <button
              type="button"
              className="list-nav__action"
              aria-label={`Delete ${list.displayName}`}
              onClick={() => setDeleting(list)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      {creating ? (
        <ListNameForm
          submitLabel="Create"
          onCancel={() => setCreating(false)}
          onSubmit={(displayName) => {
            const listId = slug()
            mutate({ id: crypto.randomUUID(), kind: 'createList', listId, displayName })
            setCreating(false)
            props.onSelect(listId)
          }}
        />
      ) : (
        <button
          type="button"
          className="list-nav__add"
          onClick={() => setCreating(true)}
        >
          + New list
        </button>
      )}

      {renaming && (
        <ListNameForm
          initial={renaming.displayName}
          submitLabel="Rename"
          onCancel={() => setRenaming(null)}
          onSubmit={(displayName) => {
            mutate({
              id: crypto.randomUUID(),
              kind: 'renameList',
              listId: renaming.id,
              displayName,
            })
            setRenaming(null)
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete "${deleting?.displayName ?? ''}"?`}
        confirmLabel="Delete list"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return
          mutate({
            id: crypto.randomUUID(),
            kind: 'deleteList',
            listId: deleting.id,
          })
          setDeleting(null)
        }}
      >
        <p>This deletes the list and all its todos from the server.</p>
      </ConfirmDialog>
    </nav>
  )
}
```

`apps/client/src/header.tsx`:

```tsx
import { useIsFetching } from '@tanstack/react-query'
import { api, queryClient, useOnline, usePendingCount } from './providers'
import { useSound } from './sound/use-sound'

export function Header(props: {
  title: string
  onMenu: () => void
}) {
  const online = useOnline()
  const pending = usePendingCount()
  const fetching = useIsFetching()
  const { muted, toggleMuted } = useSound()

  return (
    <header className="header">
      <button
        type="button"
        className="header__menu"
        aria-label="Lists"
        onClick={props.onMenu}
      >
        ☰
      </button>
      <h1 className="header__title">{props.title}</h1>
      <div className="header__status">
        {!online && (
          <span className="pill pill--offline">
            Offline{pending > 0 ? ` · ${pending} queued` : ''}
          </span>
        )}
        {online && pending > 0 && (
          <span className="pill pill--syncing">
            Syncing {pending} change{pending === 1 ? '' : 's'}
          </span>
        )}
        {online && pending === 0 && fetching > 0 && (
          <span className="pill">Refreshing</span>
        )}
        <button
          type="button"
          className="header__sound"
          aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
          onClick={toggleMuted}
        >
          {muted ? '🔇' : '🔊'}
        </button>
        <button
          type="button"
          className="header__signout"
          onClick={() => {
            // Outbox is preserved; it replays after the next sign-in
            // (docs/specs/authentication.md).
            void api.logout().catch(() => {})
            queryClient.setQueryData(['session'], null)
          }}
        >
          Sign out
        </button>
      </div>
    </header>
  )
}
```

(The distinct "server unreachable" pill from
[sync-and-offline](../specs/sync-and-offline.md) lands in Task 11 — the
engine needs to expose *why* the head mutation is retrying.)

`apps/client/src/main-screen.tsx`:

```tsx
import { useState } from 'react'
import { Header } from './header'
import { ListNav, useLists } from './lists/list-nav'
import { TodoPane } from './todos/todo-pane'

export function MainScreen() {
  const lists = useLists()
  const [selected, setSelected] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const active = selected ?? lists.data?.[0]?.id ?? null
  const activeList = lists.data?.find((list) => list.id === active)

  return (
    <div className="layout">
      <Header
        title={activeList?.displayName ?? 'Todos'}
        onMenu={() => setDrawerOpen((open) => !open)}
      />
      <div className="layout__body">
        <aside
          className={
            drawerOpen ? 'layout__nav layout__nav--open' : 'layout__nav'
          }
        >
          <ListNav
            selected={active}
            onSelect={(listId) => {
              setSelected(listId)
              setDrawerOpen(false)
            }}
          />
        </aside>
        <main className="layout__main">
          {active ? (
            <TodoPane listId={active} />
          ) : (
            <p className="empty">Create a list to get started.</p>
          )}
        </main>
      </div>
    </div>
  )
}
```

Create stubs so this compiles (both replaced in Tasks 10/13):

`apps/client/src/todos/todo-pane.tsx`:

```tsx
export function TodoPane(_props: { listId: string }) {
  return null
}
```

`apps/client/src/sound/use-sound.ts`:

```ts
export function useSound() {
  return { muted: true, toggleMuted: () => {}, playPop: () => {} }
}
```

- [ ] **Step 2: Verify** — `bun run --filter @caldav-todo/client typecheck`

- [ ] **Step 3: Lint, format, commit**

```bash
bun run lint && bun run fmt
git add -A && git commit -m "feat(client): main screen, list nav, header"
```

---

### Task 10: Todo pane — quick add, items, detail, completed section

**Files:**
- Create: `apps/client/src/todos/todo-pane.tsx` (replace stub),
  `apps/client/src/todos/quick-add.tsx`, `apps/client/src/todos/todo-item.tsx`,
  `apps/client/src/todos/checkbox.tsx`, `apps/client/src/todos/todo-detail.tsx`,
  `apps/client/src/todos/use-todo-actions.ts`

- [ ] **Step 1: Implement**

`apps/client/src/todos/use-todo-actions.ts`:

```ts
import type {
  Mutation,
  NewTodo,
  Todo,
  TodoChanges,
  TodosResponse,
} from '@caldav-todo/schemas'
import { queryClient, useSyncEngine } from '../providers'
import { applyMutationToTodos } from '../sync/optimistic'

// Optimistic write path — docs/specs/sync-and-offline.md (writes).
export function useTodoActions(listId: string) {
  const engine = useSyncEngine()

  const mutate = (mutation: Mutation): void => {
    queryClient.setQueryData<TodosResponse>(['todos', listId], (cache) =>
      applyMutationToTodos(cache ?? { ctag: '', todos: [] }, mutation),
    )
    void engine.enqueue(mutation)
  }

  return {
    add: (todo: NewTodo) =>
      mutate({ id: crypto.randomUUID(), kind: 'createTodo', listId, todo }),
    update: (todo: Todo, changes: TodoChanges) =>
      mutate({
        id: crypto.randomUUID(),
        kind: 'updateTodo',
        listId,
        uid: todo.uid,
        etag: todo.etag,
        changes,
      }),
    remove: (todo: Todo) =>
      mutate({
        id: crypto.randomUUID(),
        kind: 'deleteTodo',
        listId,
        uid: todo.uid,
        etag: todo.etag,
      }),
  }
}
```

`apps/client/src/todos/checkbox.tsx` (the micro-interaction centerpiece —
[ui](../specs/ui.md)):

```tsx
export function Checkbox(props: {
  checked: boolean
  label: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={props.checked}
      aria-label={props.label}
      className={props.checked ? 'check check--done' : 'check'}
      onClick={props.onToggle}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle className="check__ring" cx="12" cy="12" r="10.5" />
        <path className="check__mark" d="M7 12.5l3.5 3.5L17 9" />
      </svg>
    </button>
  )
}
```

`apps/client/src/todos/quick-add.tsx`:

```tsx
import { useState } from 'react'

// Enter adds and keeps focus for rapid entry — docs/specs/todos.md.
export function QuickAdd(props: { onAdd: (summary: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <form
      className="quick-add"
      onSubmit={(event) => {
        event.preventDefault()
        const summary = value.trim()
        if (summary === '') return
        props.onAdd(summary)
        setValue('')
      }}
    >
      <input
        value={value}
        placeholder="Add a todo…"
        aria-label="Add a todo"
        enterKeyHint="done"
        onChange={(event) => setValue(event.target.value)}
      />
    </form>
  )
}
```

`apps/client/src/todos/todo-item.tsx`:

```tsx
import type { Todo } from '@caldav-todo/schemas'
import { dueInstant, isOverdue } from './sort'
import { Checkbox } from './checkbox'

const formatDue = (todo: Todo): string | null => {
  if (!todo.due) return null
  // dueInstant resolves all four forms consistently — see
  // docs/specs/todos.md#ordering-and-overdue-comparison.
  return new Date(dueInstant(todo)).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

export function TodoItem(props: {
  todo: Todo
  now: Date
  onToggle: () => void
  onOpen: () => void
}) {
  const { todo } = props
  const overdue = !todo.completed && isOverdue(todo, props.now)
  return (
    <li
      className={
        todo.completed ? 'todo todo--completed' : 'todo'
      }
    >
      <Checkbox
        checked={todo.completed}
        label={`Mark "${todo.summary}" ${todo.completed ? 'active' : 'done'}`}
        onToggle={props.onToggle}
      />
      <button type="button" className="todo__body" onClick={props.onOpen}>
        <span className="todo__summary">{todo.summary}</span>
        <span className="todo__meta">
          {todo.priority && (
            <span className={`prio prio--${todo.priority}`}>
              {todo.priority}
            </span>
          )}
          {formatDue(todo) && (
            <span className={overdue ? 'due due--overdue' : 'due'}>
              {formatDue(todo)}
            </span>
          )}
        </span>
      </button>
    </li>
  )
}
```

`apps/client/src/todos/todo-detail.tsx`:

```tsx
import {
  todoPrioritySchema,
  type Todo,
  type TodoChanges,
} from '@caldav-todo/schemas'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { dueInstant } from './sort'

const detailSchema = z.object({
  summary: z.string().min(1),
  due: z.string(), // '' or yyyy-mm-dd from <input type="date">
  description: z.string(),
  priority: z.union([todoPrioritySchema, z.literal('')]),
})
type DetailForm = z.infer<typeof detailSchema>

/** Local yyyy-mm-dd for <input type="date"> (not UTC — toISOString shifts). */
const toDateInputValue = (date: Date): string =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')

// Detail edit — docs/specs/todos.md.
// The date input shows the local date of whatever form the DUE has. If the
// user doesn't touch it, we send NO due change at all, so a foreign client's
// floating/zoned/UTC value survives untouched
// (docs/specs/caldav-compliance.md). Only an actual edit rewrites it, and
// then as an all-day 'date' — which is what the date input expresses.
export function TodoDetail(props: {
  todo: Todo
  onSave: (changes: TodoChanges) => void
  onDelete: () => void
  onClose: () => void
}) {
  const { todo } = props
  // Local date of the existing due, in the input's yyyy-mm-dd format.
  const initialDue = todo.due
    ? toDateInputValue(new Date(dueInstant(todo)))
    : ''

  const { register, handleSubmit } = useForm<DetailForm>({
    resolver: zodResolver(detailSchema),
    defaultValues: {
      summary: todo.summary,
      due: initialDue,
      description: todo.description ?? '',
      priority: todo.priority ?? '',
    },
  })

  const submit = (values: DetailForm): void => {
    const changes: TodoChanges = {
      ...(values.summary !== todo.summary
        ? { summary: values.summary }
        : {}),
      // Untouched date input → omit `due` entirely → preserve as stored.
      ...(values.due === initialDue
        ? {}
        : {
            due:
              values.due === ''
                ? null
                : { kind: 'date' as const, value: values.due },
          }),
      description: values.description === '' ? null : values.description,
      priority: values.priority === '' ? null : values.priority,
    }
    props.onSave(changes)
    props.onClose()
  }

  return (
    <section className="detail" aria-label="Edit todo">
      <form onSubmit={handleSubmit(submit)}>
        <label>
          Summary
          <input {...register('summary')} />
        </label>
        <label>
          Due
          <input type="date" {...register('due')} />
        </label>
        <label>
          Priority
          <select {...register('priority')}>
            <option value="">None</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label>
          Notes
          <textarea rows={4} {...register('description')} />
        </label>
        <div className="detail__actions">
          <button type="submit">Save</button>
          <button type="button" onClick={props.onClose}>
            Close
          </button>
          <button
            type="button"
            className="detail__delete"
            onClick={props.onDelete}
          >
            Delete
          </button>
        </div>
      </form>
    </section>
  )
}
```

`apps/client/src/todos/todo-pane.tsx`:

```tsx
import type { Todo, TodosResponse } from '@caldav-todo/schemas'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api, queryClient } from '../providers'
import { ConfirmDialog } from '../confirm'
import { useSound } from '../sound/use-sound'
import { QuickAdd } from './quick-add'
import { sortActiveTodos } from './sort'
import { TodoDetail } from './todo-detail'
import { TodoItem } from './todo-item'
import { useTodoActions } from './use-todo-actions'

export function TodoPane(props: { listId: string }) {
  const todos = useQuery({
    queryKey: ['todos', props.listId],
    // Pass the cached ctag; a 304 keeps the cached copy —
    // docs/specs/caldav-compliance.md (ctag short-circuit).
    queryFn: async () => {
      const previous = queryClient.getQueryData<TodosResponse>([
        'todos',
        props.listId,
      ])
      const fresh = await api.getTodos(
        props.listId,
        previous?.ctag ? previous.ctag : undefined,
      )
      return fresh ?? previous ?? { ctag: '', todos: [] }
    },
  })
  const actions = useTodoActions(props.listId)
  const { playPop } = useSound()
  const [openUid, setOpenUid] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  const now = new Date()
  const all = todos.data?.todos ?? []
  const active = sortActiveTodos(
    all.filter((todo) => !todo.completed),
    now,
  )
  const completed = all.filter((todo) => todo.completed)
  const open = all.find((todo) => todo.uid === openUid)

  const toggle = (todo: Todo): void => {
    actions.update(todo, { completed: !todo.completed })
    if (!todo.completed) playPop()
  }

  return (
    <div className="pane">
      <QuickAdd
        onAdd={(summary) =>
          actions.add({ uid: crypto.randomUUID(), summary })
        }
      />
      <ul className="todos">
        {active.map((todo) => (
          <TodoItem
            key={todo.uid}
            todo={todo}
            now={now}
            onToggle={() => toggle(todo)}
            onOpen={() => setOpenUid(todo.uid)}
          />
        ))}
      </ul>
      {active.length === 0 && completed.length === 0 && (
        <p className="empty">Nothing to do. Savor it.</p>
      )}

      {completed.length > 0 && (
        <section className="completed">
          <button
            type="button"
            className="completed__toggle"
            aria-expanded={showCompleted}
            onClick={() => setShowCompleted((value) => !value)}
          >
            Completed ({completed.length})
          </button>
          {showCompleted && (
            <>
              <ul className="todos todos--completed">
                {completed.map((todo) => (
                  <TodoItem
                    key={todo.uid}
                    todo={todo}
                    now={now}
                    onToggle={() => toggle(todo)}
                    onOpen={() => setOpenUid(todo.uid)}
                  />
                ))}
              </ul>
              <button
                type="button"
                className="completed__clear"
                onClick={() => setConfirmClear(true)}
              >
                Clear completed
              </button>
            </>
          )}
        </section>
      )}

      {open && (
        <TodoDetail
          todo={open}
          onSave={(changes) => actions.update(open, changes)}
          onDelete={() => {
            actions.remove(open)
            setOpenUid(null)
          }}
          onClose={() => setOpenUid(null)}
        />
      )}

      <ConfirmDialog
        open={confirmClear}
        title="Clear completed?"
        confirmLabel={`Delete ${completed.length}`}
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          for (const todo of completed) actions.remove(todo)
          setConfirmClear(false)
        }}
      >
        <p>Deletes {completed.length} completed todos from the server.</p>
      </ConfirmDialog>
    </div>
  )
}
```

- [ ] **Step 2: Verify** — `bun run --filter @caldav-todo/client typecheck && bun run lint`

- [ ] **Step 3: Lint, format, commit**

```bash
bun run fmt
git add -A && git commit -m "feat(client): todo pane, detail, completed section"
```

---

### Task 11: "Server unreachable" pill

The engine distinguishes *offline* (NetworkError) from *CalDAV down* (502)
([sync-and-offline](../specs/sync-and-offline.md)).

**Files:**
- Modify: `apps/client/src/sync/engine.ts`, `apps/client/src/sync/process.ts`,
  `apps/client/src/header.tsx`
- Test: extend `apps/client/test/engine.test.ts`

- [ ] **Step 1: Add the failing test** (append to `engine.test.ts`)

```ts
import { ApiError } from '../src/api/errors'

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
  })
  engine.start()
  await engine.enqueue(mutation)
  await vi.waitFor(() =>
    expect(engine.getStatus().blocked).toBe('server'),
  )
  engine.stop()
})
```

- [ ] **Step 2: Implement**

In `process.ts`, add after the imports:

```ts
export type BlockReason = 'offline' | 'server'

export class TaggedRetryableError extends RetryableError {
  constructor(
    readonly reason: BlockReason,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}
```

and change the two throw sites (the 401 case stays a plain
`RetryableError`):

```ts
      if (error instanceof NetworkError) {
        throw new TaggedRetryableError('offline', 'offline', { cause: error })
      }
      // …
      if (error.status === 502) {
        throw new TaggedRetryableError('server', 'caldav unreachable', {
          cause: error,
        })
      }
```

In `engine.ts`, extend the status plumbing (replacing the existing
`SyncStatus`, `status`, `notify`, and `loop` declarations):

```ts
import { TaggedRetryableError, type BlockReason } from './process'

export interface SyncStatus {
  pending: number
  blocked: BlockReason | null
}

// inside createSyncEngine:
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
    invalidateFor(mutation)
    onDropped(mutation, error)
  },
})
```

In `header.tsx`, replace the offline pill block:

```tsx
{!online && (
  <span className="pill pill--offline">
    Offline{pending > 0 ? ` · ${pending} queued` : ''}
  </span>
)}
{online && blocked === 'server' && (
  <span className="pill pill--offline">
    Server unreachable{pending > 0 ? ` · ${pending} queued` : ''}
  </span>
)}
{online && blocked !== 'server' && pending > 0 && (
  <span className="pill pill--syncing">
    Syncing {pending} change{pending === 1 ? '' : 's'}
  </span>
)}
```

with `const { pending, blocked } = useSyncStatus()` — add that hook to
`providers.tsx`:

```tsx
export function useSyncStatus(): SyncStatus {
  const engine = useSyncEngine()
  return useSyncExternalStore(engine.subscribe, engine.getStatus)
}
```

(keep `usePendingCount` delegating to it or remove it — one source of truth).

- [ ] **Step 3: Run tests** — `bun run test -- apps/client`
Expected: PASS, including prior engine tests.

- [ ] **Step 4: Lint, format, commit**

```bash
bun run lint && bun run fmt
git add -A && git commit -m "feat(client): distinguish offline vs server-down"
```

---

### Task 12: Styles — serif minimalism, responsive, micro-interactions

**Files:**
- Modify: `apps/client/src/styles/app.css` (full content below)

- [ ] **Step 1: Write the stylesheet**

`apps/client/src/styles/app.css`:

```css
/* docs/specs/ui.md — typography, palette, micro-interactions. */
:root {
  --serif: Charter, 'Bitstream Charter', 'Sitka Text', Cambria, Georgia,
    serif;
  --paper: #faf9f6;
  --ink: #1a1816;
  --muted: #8a8377;
  --accent: #7a5c3e;
  --danger: #a03023;
  --line: #e5e1d8;
  --ease: cubic-bezier(0.22, 1, 0.36, 1);
}
@media (prefers-color-scheme: dark) {
  :root {
    --paper: #17150f;
    --ink: #ece7dd;
    --muted: #8f887c;
    --accent: #c9a87c;
    --line: #2c2921;
  }
}

* {
  box-sizing: border-box;
}
body {
  margin: 0;
  font-family: var(--serif);
  font-size: 16px; /* 14px minimum anywhere; inputs stay ≥16px (iOS) */
  color: var(--ink);
  background: var(--paper);
}
input,
select,
textarea,
button {
  font: inherit;
  font-size: 16px;
  color: inherit;
}
input,
select,
textarea {
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  width: 100%;
}
button {
  cursor: pointer;
  background: none;
  border: none;
  transition: transform 120ms var(--ease);
}
button:active {
  transform: scale(0.97);
}

/* Layout */
.layout {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}
.layout__body {
  display: flex;
  flex: 1;
}
.layout__nav {
  display: none;
}
.layout__nav--open {
  display: block;
  position: fixed;
  inset: 3.5rem 20% 0 0;
  background: var(--paper);
  border-right: 1px solid var(--line);
  padding: 1rem;
  z-index: 10;
}
.layout__main {
  flex: 1;
  max-width: 40rem;
  margin: 0 auto;
  padding: 1rem;
  width: 100%;
}
@media (min-width: 768px) {
  .layout__nav,
  .layout__nav--open {
    display: block;
    position: static;
    width: 15rem;
    border-right: 1px solid var(--line);
    padding: 1.5rem 1rem;
  }
  .header__menu {
    display: none;
  }
}

/* Header */
.header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--line);
  position: sticky;
  top: 0;
  background: var(--paper);
  z-index: 20;
}
.header__title {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0;
  flex: 1;
}
.pill {
  font-size: 14px;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0.15rem 0.7rem;
  color: var(--muted);
}
.pill--offline {
  color: var(--paper);
  background: var(--accent);
  border-color: var(--accent);
}
.header__signout {
  color: var(--muted);
  font-size: 14px;
}

/* Lists nav */
.list-nav ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.list-nav li {
  display: flex;
  align-items: center;
}
.list-nav__item {
  flex: 1;
  text-align: left;
  padding: 0.5rem 0.5rem;
  border-radius: 6px;
  font-size: 16px;
}
.list-nav__item--active {
  background: var(--line);
}
.list-nav__action {
  color: var(--muted);
  font-size: 14px;
  padding: 0.25rem;
  opacity: 0;
}
.list-nav li:hover .list-nav__action,
.list-nav li:focus-within .list-nav__action {
  opacity: 1;
}
.list-nav__add {
  margin-top: 0.75rem;
  color: var(--muted);
}
.list-form {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
  flex-wrap: wrap;
}

/* Quick add */
.quick-add input {
  border: none;
  border-bottom: 1px solid var(--line);
  border-radius: 0;
  padding: 0.75rem 0.25rem;
  font-size: 18px;
}
.quick-add input:focus {
  outline: none;
  border-bottom-color: var(--accent);
}

/* Todos */
.todos {
  list-style: none;
  margin: 1rem 0 0;
  padding: 0;
}
.todo {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0.25rem;
  border-bottom: 1px solid var(--line);
  animation: todo-in 240ms var(--ease);
}
@keyframes todo-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
}
.todo__body {
  flex: 1;
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  text-align: left;
  padding: 0;
  min-height: 44px;
}
.todo__summary {
  font-size: 16px;
  position: relative;
}
.todo__summary::after {
  content: '';
  position: absolute;
  left: 0;
  top: 55%;
  height: 1px;
  width: 0;
  background: var(--muted);
  transition: width 260ms var(--ease);
}
.todo--completed .todo__summary {
  color: var(--muted);
}
.todo--completed .todo__summary::after {
  width: 100%;
}
.todo__meta {
  margin-left: auto;
  display: flex;
  gap: 0.5rem;
  font-size: 14px;
  color: var(--muted);
}
.prio--high {
  color: var(--danger);
}
.due--overdue {
  color: var(--danger);
}

/* Checkbox micro-interaction */
.check {
  width: 28px;
  height: 28px;
  padding: 0;
  flex: none;
}
.check svg {
  width: 100%;
  height: 100%;
  fill: none;
  stroke: var(--muted);
  stroke-width: 1.5;
}
.check__mark {
  stroke: var(--accent);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 16;
  stroke-dashoffset: 16;
  transition: stroke-dashoffset 220ms var(--ease) 40ms;
}
.check--done .check__ring {
  stroke: var(--accent);
}
.check--done .check__mark {
  stroke-dashoffset: 0;
}

/* Completed section */
.completed {
  margin-top: 1.5rem;
}
.completed__toggle,
.completed__clear {
  color: var(--muted);
  font-size: 14px;
}
.todos--completed {
  opacity: 0.75;
}

/* Detail, dialogs, login, toasts */
.detail {
  border-top: 1px solid var(--line);
  margin-top: 1rem;
  padding-top: 1rem;
}
.detail form,
.login form {
  display: grid;
  gap: 0.9rem;
}
.detail label,
.login label {
  display: grid;
  gap: 0.3rem;
  font-size: 14px;
  color: var(--muted);
}
.detail__actions {
  display: flex;
  gap: 0.75rem;
}
.detail__delete,
.confirm__danger {
  color: var(--danger);
  margin-left: auto;
}
.confirm {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--paper);
  color: var(--ink);
  padding: 1.25rem;
  max-width: 22rem;
}
.confirm::backdrop {
  background: rgb(0 0 0 / 0.35);
}
.confirm__actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 1rem;
}
.login {
  max-width: 22rem;
  margin: 15dvh auto 0;
  padding: 1rem;
}
.login__hint,
.empty {
  color: var(--muted);
}
.login__error {
  color: var(--danger);
  font-size: 14px;
}
.login button[type='submit'] {
  border: 1px solid var(--accent);
  border-radius: 6px;
  padding: 0.6rem;
  color: var(--accent);
}
.toasts {
  position: fixed;
  bottom: 1rem;
  left: 50%;
  transform: translateX(-50%);
  display: grid;
  gap: 0.5rem;
  z-index: 30;
}
.toast {
  background: var(--ink);
  color: var(--paper);
  border-radius: 8px;
  padding: 0.6rem 1rem;
  font-size: 14px;
  animation: todo-in 200ms var(--ease);
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation: none !important;
    transition: none !important;
  }
}
```

- [ ] **Step 2: Visual check**

Run: `SESSION_SECRET=dev-secret-16-chars-min bun run --filter @caldav-todo/server dev` and `bun run --filter @caldav-todo/client dev` (two terminals), with a local
radicale (`radicale --auth-type none --storage-filesystem-folder /tmp/radicale-dev`).
Open the vite URL: verify login renders serif/minimal, sign in
(`http://localhost:5232/<any-user>/`), create a list, add todos, check one
off — the checkmark should draw in and the strikethrough sweep. Resize to
mobile width: drawer toggles via ☰. Toggle OS dark mode: palette follows.

- [ ] **Step 3: Lint, format, commit**

```bash
bun run lint && bun run fmt
git add -A && git commit -m "feat(client): serif minimalist styles + micro-interactions"
```

---

### Task 13: Completion sound (stretch)

**Files:**
- Create: `apps/client/src/sound/pop.ts`
- Modify: `apps/client/src/sound/use-sound.ts` (replace stub)

- [ ] **Step 1: Implement**

`apps/client/src/sound/pop.ts`:

```ts
// Synthesized completion pop — no audio assets (docs/specs/ui.md).
let context: AudioContext | null = null

export function playPop(): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  context ??= new AudioContext()
  const now = context.currentTime
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(520, now)
  oscillator.frequency.exponentialRampToValueAtTime(880, now + 0.09)
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14)
  oscillator.connect(gain).connect(context.destination)
  oscillator.start(now)
  oscillator.stop(now + 0.15)
}
```

`apps/client/src/sound/use-sound.ts`:

```ts
import { useSyncExternalStore } from 'react'
import { playPop as pop } from './pop'

const KEY = 'caldav-todo-muted'
const listeners = new Set<() => void>()

const isMuted = (): boolean => localStorage.getItem(KEY) === '1'

export function useSound() {
  const muted = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    isMuted,
  )
  return {
    muted,
    toggleMuted: (): void => {
      localStorage.setItem(KEY, muted ? '0' : '1')
      for (const listener of listeners) listener()
    },
    playPop: (): void => {
      if (!isMuted()) pop()
    },
  }
}
```

- [ ] **Step 2: Verify** — dev servers up, check a todo off: pop plays;
mute via 🔇 silences it; OS reduced-motion silences it.

- [ ] **Step 3: Lint, format, typecheck, commit**

```bash
bun run lint && bun run fmt && bun run typecheck
git add -A && git commit -m "feat(client): synthesized completion sound with mute"
```

---

### Task 14: Full client verification

- [ ] **Step 1: Run everything**

```bash
bun run lint && bun run fmt:check && bun run typecheck && bun run test
```

Expected: all green.

- [ ] **Step 2: Manual offline drill** (dev servers + radicale running)

1. Add two todos. 2. DevTools → Network → Offline. 3. Add a todo, complete
another — UI stays responsive, header shows "Offline · 2 queued". 4. Back
online — pill clears, radicale storage folder shows the new `.ics` files.
5. Reload while offline — todos still render (persisted cache).

- [ ] **Step 3: Commit any fixes**

```bash
git add -A && git commit -m "fix(client): offline drill findings"
```

(Skip the commit if the drill surfaced nothing.)
