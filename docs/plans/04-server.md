# Plan 04: Bun BFF Server

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The stateless Bun server: sealed-cookie auth, CalDAV gateway (tsdav + `@caldav-todo/vtodo`), one-file-per-handler JSON API, verified against a real Radicale in integration tests.

**Architecture:** Handlers depend on a `CaldavGateway` **interface** and are unit-tested with a fake. The tsdav implementation is tested only by the Radicale integration suite (no duplicate coverage). Router maps typed errors to HTTP statuses per [api](../specs/api.md); auth per [authentication](../specs/authentication.md); preservation via `applyChanges` per [caldav-compliance](../specs/caldav-compliance.md).

**Tech Stack:** Bun.serve, tsdav, `@caldav-todo/{schemas,vtodo}`, WebCrypto AES-256-GCM, vitest.

---

### Task 1: Scaffold + config

**Files:**
- Create: `apps/server/package.json`, `apps/server/tsconfig.json`,
  `apps/server/src/config.ts`

- [ ] **Step 1: Scaffold**

`apps/server/package.json`:

```json
{
  "name": "@caldav-todo/server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "start": "bun src/index.ts",
    "typecheck": "tsc --noEmit",
    "test:integration": "vitest run --config vitest.integration.config.ts"
  },
  "dependencies": {
    "@caldav-todo/schemas": "workspace:*",
    "@caldav-todo/vtodo": "workspace:*",
    "tsdav": "^2.1.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^7.0.0",
    "vitest": "^3.0.0"
  }
}
```

`apps/server/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["bun"] },
  "include": ["src", "test"]
}
```

`apps/server/src/config.ts`:

```ts
import { z } from 'zod'

const configSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  SESSION_SECRET: z.string().min(16),
  NODE_ENV: z.enum(['development', 'production']).default('development'),
})

export type Config = z.infer<typeof configSchema>

export function loadConfig(env: Record<string, string | undefined>): Config {
  return configSchema.parse(env)
}
```

Run: `bun install && bun run --filter @caldav-todo/server typecheck`
Expected: exit 0.

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "chore(server): scaffold and env config"
```

---

### Task 2: Sealing (AES-256-GCM)

**Files:**
- Create: `apps/server/src/crypto/seal.ts`
- Test: `apps/server/test/seal.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/server/test/seal.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { seal, unseal } from '../src/crypto/seal'

const SECRET = 'a-test-secret-at-least-16-chars'

describe('seal/unseal', () => {
  it('round-trips plaintext', async () => {
    const sealed = await seal('hello world', SECRET)
    expect(sealed).not.toContain('hello')
    expect(await unseal(sealed, SECRET)).toBe('hello world')
  })

  it('produces a different ciphertext each time (fresh IV)', async () => {
    expect(await seal('x', SECRET)).not.toBe(await seal('x', SECRET))
  })

  it('returns null for a tampered payload', async () => {
    const sealed = await seal('hello', SECRET)
    const tampered = `${sealed.slice(0, -2)}AA`
    expect(await unseal(tampered, SECRET)).toBeNull()
  })

  it('returns null for the wrong secret', async () => {
    const sealed = await seal('hello', SECRET)
    expect(await unseal(sealed, 'another-secret-16-chars-long')).toBeNull()
  })

  it('returns null for garbage input', async () => {
    expect(await unseal('not-a-sealed-value', SECRET)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- apps/server`
Expected: FAIL — cannot resolve `../src/crypto/seal`.

- [ ] **Step 3: Implement**

`apps/server/src/crypto/seal.ts`:

```ts
const encoder = new TextEncoder()
const decoder = new TextDecoder()

async function deriveKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret))
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}

const toBase64Url = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString('base64url')
const fromBase64Url = (text: string): Uint8Array =>
  new Uint8Array(Buffer.from(text, 'base64url'))

export async function seal(plaintext: string, secret: string): Promise<string> {
  const key = await deriveKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext),
  )
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`
}

export async function unseal(
  sealed: string,
  secret: string,
): Promise<string | null> {
  const [ivPart, dataPart] = sealed.split('.')
  if (!ivPart || !dataPart) return null
  try {
    const key = await deriveKey(secret)
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64Url(ivPart) },
      key,
      fromBase64Url(dataPart),
    )
    return decoder.decode(plaintext)
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- apps/server`
Expected: PASS.

- [ ] **Step 5: Lint, format, commit**

```bash
bun run lint && bun run fmt
git add -A && git commit -m "feat(server): AES-GCM sealing"
```

---

### Task 3: Session cookie helpers

**Files:**
- Create: `apps/server/src/session/cookie.ts`
- Test: `apps/server/test/cookie.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/server/test/cookie.test.ts`:

```ts
import type { Credentials } from '@caldav-todo/schemas'
import { describe, expect, it } from 'vitest'
import {
  clearSessionCookie,
  readSession,
  sessionCookie,
} from '../src/session/cookie'

const SECRET = 'a-test-secret-at-least-16-chars'
const CREDS: Credentials = {
  serverUrl: 'http://localhost:5232',
  username: 'jack',
  password: 'hunter2',
}

describe('session cookie', () => {
  it('round-trips credentials through the Cookie header', async () => {
    const setCookie = await sessionCookie(CREDS, SECRET, false)
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Strict')
    expect(setCookie).not.toContain('hunter2')

    const value = setCookie.split(';')[0] ?? ''
    const request = new Request('http://x/', {
      headers: { cookie: `other=1; ${value}` },
    })
    expect(await readSession(request, SECRET)).toEqual(CREDS)
  })

  it('adds Secure only when asked', async () => {
    expect(await sessionCookie(CREDS, SECRET, true)).toContain('Secure')
    expect(await sessionCookie(CREDS, SECRET, false)).not.toContain('Secure')
  })

  it('returns null without a cookie or with a tampered one', async () => {
    expect(await readSession(new Request('http://x/'), SECRET)).toBeNull()
    const request = new Request('http://x/', {
      headers: { cookie: 'session=tampered' },
    })
    expect(await readSession(request, SECRET)).toBeNull()
  })

  it('clearSessionCookie expires the cookie', () => {
    expect(clearSessionCookie()).toContain('Max-Age=0')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- apps/server`
Expected: FAIL — cannot resolve `../src/session/cookie`.

- [ ] **Step 3: Implement**

`apps/server/src/session/cookie.ts`:

```ts
import { credentialsSchema, type Credentials } from '@caldav-todo/schemas'
import { seal, unseal } from '../crypto/seal'

const NAME = 'session'
const BASE = 'Path=/; HttpOnly; SameSite=Strict'

export async function sessionCookie(
  credentials: Credentials,
  secret: string,
  secure: boolean,
): Promise<string> {
  const sealed = await seal(JSON.stringify(credentials), secret)
  return `${NAME}=${sealed}; ${BASE}${secure ? '; Secure' : ''}`
}

export function clearSessionCookie(): string {
  return `${NAME}=; ${BASE}; Max-Age=0`
}

export async function readSession(
  request: Request,
  secret: string,
): Promise<Credentials | null> {
  const header = request.headers.get('cookie')
  if (!header) return null
  const pair = header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${NAME}=`))
  if (!pair) return null
  const plaintext = await unseal(pair.slice(NAME.length + 1), secret)
  if (plaintext === null) return null
  // Trust boundary: the cookie came from the network.
  const parsed = credentialsSchema.safeParse(JSON.parse(plaintext))
  return parsed.success ? parsed.data : null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- apps/server`
Expected: PASS.

- [ ] **Step 5: Lint, format, commit**

```bash
bun run lint && bun run fmt
git add -A && git commit -m "feat(server): sealed session cookie"
```

---

### Task 4: Gateway interface, typed errors, route plumbing

**Files:**
- Create: `apps/server/src/caldav/errors.ts`,
  `apps/server/src/caldav/gateway.ts`, `apps/server/src/http/errors.ts`,
  `apps/server/src/api/route.ts`, `apps/server/src/api/router.ts`
- Test: `apps/server/test/router.test.ts`

- [ ] **Step 1: Write the interfaces and errors** (no tests — declarations
only; behavior is tested via the router test and handler tests)

`apps/server/src/caldav/errors.ts`:

```ts
/** Upstream CalDAV server answered with an error status. */
export class CaldavError extends Error {
  override name = 'CaldavError'
  constructor(
    readonly status: number,
    message?: string,
  ) {
    super(message ?? `CalDAV server responded ${status}`)
  }
}

/** Could not reach the CalDAV server at all. */
export class CaldavUnreachableError extends Error {
  override name = 'CaldavUnreachableError'
}
```

`apps/server/src/caldav/gateway.ts`:

```ts
import type {
  Credentials,
  NewTodo,
  Todo,
  TodoChanges,
  TodoList,
  TodosResponse,
} from '@caldav-todo/schemas'

// The seam between HTTP handlers and CalDAV. Handlers are unit-tested
// against a fake; the tsdav implementation is covered by the Radicale
// integration suite. See docs/specs/api.md.
export interface CaldavGateway {
  /** Principal discovery; throws CaldavError(401) on bad credentials. */
  login(): Promise<void>
  fetchLists(): Promise<TodoList[]>
  createList(id: string, displayName: string): Promise<TodoList>
  renameList(listId: string, displayName: string): Promise<void>
  deleteList(listId: string): Promise<void>
  /**
   * `null` when knownCtag matches the collection's current ctag —
   * the cheap-refetch short-circuit (docs/specs/caldav-compliance.md).
   */
  fetchTodos(
    listId: string,
    knownCtag?: string,
  ): Promise<TodosResponse | null>
  fetchTodo(listId: string, uid: string): Promise<Todo>
  createTodo(listId: string, todo: NewTodo): Promise<Todo>
  updateTodo(
    listId: string,
    uid: string,
    etag: string,
    changes: TodoChanges,
  ): Promise<Todo>
  deleteTodo(listId: string, uid: string, etag: string): Promise<void>
}

export type GatewayFactory = (credentials: Credentials) => CaldavGateway
```

`apps/server/src/http/errors.ts`:

```ts
export class HttpError extends Error {
  override name = 'HttpError'
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}
```

`apps/server/src/api/route.ts`:

```ts
import type { Credentials } from '@caldav-todo/schemas'
import type { GatewayFactory } from '../caldav/gateway'
import type { Config } from '../config'
import { HttpError } from '../http/errors'
import { readSession } from '../session/cookie'

export interface AppContext {
  config: Config
  makeGateway: GatewayFactory
}

export interface RequestContext {
  request: Request
  params: Record<string, string>
  app: AppContext
}

export interface Route {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  handle: (ctx: RequestContext) => Promise<Response>
}

/** Match `/api/lists/:listId` style paths. Returns params or null. */
export function matchPath(
  pattern: string,
  pathname: string,
): Record<string, string> | null {
  const patternParts = pattern.split('/')
  const pathParts = pathname.split('/')
  if (patternParts.length !== pathParts.length) return null
  const params: Record<string, string> = {}
  for (const [index, part] of patternParts.entries()) {
    const actual = pathParts[index] ?? ''
    if (part.startsWith(':')) {
      if (actual === '') return null
      params[part.slice(1)] = decodeURIComponent(actual)
    } else if (part !== actual) {
      return null
    }
  }
  return params
}

export async function requireCredentials(
  ctx: RequestContext,
): Promise<Credentials> {
  const credentials = await readSession(
    ctx.request,
    ctx.app.config.SESSION_SECRET,
  )
  if (!credentials) throw new HttpError(401, 'unauthorized', 'Not signed in')
  return credentials
}

export const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(body, { status, ...(headers ? { headers } : {}) })
```

- [ ] **Step 2: Write the failing router test**

`apps/server/test/router.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { CaldavError, CaldavUnreachableError } from '../src/caldav/errors'
import { createRouter } from '../src/api/router'
import { json, type Route } from '../src/api/route'
import { HttpError } from '../src/http/errors'
import { testApp } from './helpers/test-app'

const routes: Route[] = [
  {
    method: 'GET',
    path: '/api/echo/:name',
    handle: (ctx) => Promise.resolve(json({ name: ctx.params['name'] })),
  },
  {
    method: 'POST',
    path: '/api/parse',
    handle: async (ctx) => {
      z.object({ n: z.number() }).parse(await ctx.request.json())
      return json({ ok: true })
    },
  },
  {
    method: 'GET',
    path: '/api/http-error',
    handle: () => Promise.reject(new HttpError(403, 'nope', 'Nope')),
  },
  {
    method: 'GET',
    path: '/api/caldav-401',
    handle: () => Promise.reject(new CaldavError(401)),
  },
  {
    method: 'GET',
    path: '/api/unreachable',
    handle: () => Promise.reject(new CaldavUnreachableError('down')),
  },
]

const handle = createRouter(routes, testApp())

describe('router', () => {
  it('routes and decodes path params', async () => {
    const res = await handle(
      new Request('http://x/api/echo/list%2Fone'),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ name: 'list/one' })
  })

  it('404s unknown paths and 405s wrong methods as 404', async () => {
    expect((await handle(new Request('http://x/api/nope'))).status).toBe(404)
    const res = await handle(
      new Request('http://x/api/echo/a', { method: 'POST' }),
    )
    expect(res.status).toBe(404)
  })

  it('maps zod failures to 400 with a structured body', async () => {
    const res = await handle(
      new Request('http://x/api/parse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ n: 'not a number' }),
      }),
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'invalid_request' })
  })

  it('passes HttpError through', async () => {
    const res = await handle(new Request('http://x/api/http-error'))
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'nope' })
  })

  it('maps CaldavError(401) to 401', async () => {
    const res = await handle(new Request('http://x/api/caldav-401'))
    expect(res.status).toBe(401)
  })

  it('maps CaldavUnreachableError to 502', async () => {
    const res = await handle(new Request('http://x/api/unreachable'))
    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ error: 'caldav_unreachable' })
  })
})
```

`apps/server/test/helpers/test-app.ts`:

```ts
import type { AppContext } from '../../src/api/route'
import type { CaldavGateway } from '../../src/caldav/gateway'

export const TEST_SECRET = 'a-test-secret-at-least-16-chars'

export function testApp(gateway?: Partial<CaldavGateway>): AppContext {
  const throwing = () => {
    throw new Error('gateway method not stubbed for this test')
  }
  const base: CaldavGateway = {
    login: throwing,
    fetchLists: throwing,
    createList: throwing,
    renameList: throwing,
    deleteList: throwing,
    fetchTodos: throwing,
    fetchTodo: throwing,
    createTodo: throwing,
    updateTodo: throwing,
    deleteTodo: throwing,
  }
  return {
    config: {
      PORT: 0,
      SESSION_SECRET: TEST_SECRET,
      NODE_ENV: 'development',
    },
    makeGateway: () => ({ ...base, ...gateway }),
  }
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun run test -- apps/server`
Expected: FAIL — cannot resolve `../src/api/router`.

- [ ] **Step 4: Implement the router**

`apps/server/src/api/router.ts`:

```ts
import { ZodError } from 'zod'
import { CaldavError, CaldavUnreachableError } from '../caldav/errors'
import { HttpError } from '../http/errors'
import { json, matchPath, type AppContext, type Route } from './route'

// Error mapping per docs/specs/api.md.
function toResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return json({ error: error.code, message: error.message }, error.status)
  }
  if (error instanceof ZodError) {
    return json(
      { error: 'invalid_request', message: error.message },
      400,
    )
  }
  if (error instanceof CaldavError) {
    if (error.status === 401) {
      return json({ error: 'unauthorized', message: error.message }, 401)
    }
    if (error.status === 412) {
      return json({ error: 'conflict', message: error.message }, 412)
    }
    return json({ error: 'caldav_error', message: error.message }, 502)
  }
  if (error instanceof CaldavUnreachableError) {
    return json(
      { error: 'caldav_unreachable', message: 'CalDAV server unreachable' },
      502,
    )
  }
  console.error('unhandled error', error)
  return json({ error: 'internal', message: 'Internal server error' }, 500)
}

export function createRouter(routes: Route[], app: AppContext) {
  return async (request: Request): Promise<Response> => {
    const { pathname } = new URL(request.url)
    for (const route of routes) {
      if (route.method !== request.method) continue
      const params = matchPath(route.path, pathname)
      if (!params) continue
      try {
        return await route.handle({ request, params, app })
      } catch (error) {
        return toResponse(error)
      }
    }
    return json({ error: 'not_found', message: 'No such route' }, 404)
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run test -- apps/server`
Expected: PASS.

- [ ] **Step 6: Lint, format, commit**

```bash
bun run lint && bun run fmt
git add -A && git commit -m "feat(server): router, gateway seam, error mapping"
```

---

### Task 5: Session handlers

**Files:**
- Create: `apps/server/src/api/session/create.ts`,
  `apps/server/src/api/session/destroy.ts`, `apps/server/src/api/routes.ts`
- Test: `apps/server/test/handlers/session.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/server/test/handlers/session.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { CaldavError } from '../../src/caldav/errors'
import { createRouter } from '../../src/api/router'
import { routes } from '../../src/api/routes'
import { testApp, TEST_SECRET } from '../helpers/test-app'
import { readSession } from '../../src/session/cookie'

const CREDS = {
  serverUrl: 'http://localhost:5232',
  username: 'jack',
  password: 'hunter2',
}

const loginRequest = (body: unknown) =>
  new Request('http://x/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/session', () => {
  it('verifies credentials, sets the sealed cookie, returns the session', async () => {
    const login = vi.fn().mockResolvedValue(undefined)
    const handle = createRouter(routes, testApp({ login }))
    const res = await handle(loginRequest(CREDS))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      serverUrl: CREDS.serverUrl,
      username: CREDS.username,
    })
    expect(login).toHaveBeenCalled()

    const setCookie = res.headers.get('set-cookie') ?? ''
    const cookieRequest = new Request('http://x/', {
      headers: { cookie: setCookie.split(';')[0] ?? '' },
    })
    expect(await readSession(cookieRequest, TEST_SECRET)).toEqual(CREDS)
  })

  it('401s when the CalDAV server rejects the credentials', async () => {
    const handle = createRouter(
      routes,
      testApp({ login: () => Promise.reject(new CaldavError(401)) }),
    )
    const res = await handle(loginRequest(CREDS))
    expect(res.status).toBe(401)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('400s an invalid body', async () => {
    const handle = createRouter(routes, testApp())
    const res = await handle(loginRequest({ serverUrl: 'not a url' }))
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/session', () => {
  it('clears the cookie', async () => {
    const handle = createRouter(routes, testApp())
    const res = await handle(
      new Request('http://x/api/session', { method: 'DELETE' }),
    )
    expect(res.status).toBe(204)
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- apps/server`
Expected: FAIL — cannot resolve `../../src/api/routes`.

- [ ] **Step 3: Implement**

`apps/server/src/api/session/create.ts`:

```ts
import { credentialsSchema } from '@caldav-todo/schemas'
import { sessionCookie } from '../../session/cookie'
import { json, type Route } from '../route'

// POST /api/session — docs/specs/authentication.md
export const createSession: Route = {
  method: 'POST',
  path: '/api/session',
  handle: async (ctx) => {
    const credentials = credentialsSchema.parse(await ctx.request.json())
    await ctx.app.makeGateway(credentials).login()
    const cookie = await sessionCookie(
      credentials,
      ctx.app.config.SESSION_SECRET,
      ctx.app.config.NODE_ENV === 'production',
    )
    return json(
      { serverUrl: credentials.serverUrl, username: credentials.username },
      200,
      { 'set-cookie': cookie },
    )
  },
}
```

`apps/server/src/api/session/destroy.ts`:

```ts
import { clearSessionCookie } from '../../session/cookie'
import type { Route } from '../route'

// DELETE /api/session — docs/specs/authentication.md
export const destroySession: Route = {
  method: 'DELETE',
  path: '/api/session',
  handle: () =>
    Promise.resolve(
      new Response(null, {
        status: 204,
        headers: { 'set-cookie': clearSessionCookie() },
      }),
    ),
}
```

`apps/server/src/api/routes.ts` (grows as handlers land in later tasks):

```ts
import type { Route } from './route'
import { createSession } from './session/create'
import { destroySession } from './session/destroy'

export const routes: Route[] = [createSession, destroySession]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- apps/server`
Expected: PASS.

- [ ] **Step 5: Lint, format, commit**

```bash
bun run lint && bun run fmt
git add -A && git commit -m "feat(server): session handlers"
```

---

### Task 6: List handlers

**Files:**
- Create: `apps/server/src/api/lists/{list,create,rename,remove}.ts`
- Modify: `apps/server/src/api/routes.ts`
- Test: `apps/server/test/handlers/lists.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/server/test/handlers/lists.test.ts`:

```ts
import type { TodoList } from '@caldav-todo/schemas'
import { describe, expect, it, vi } from 'vitest'
import { createRouter } from '../../src/api/router'
import { routes } from '../../src/api/routes'
import { sessionCookie } from '../../src/session/cookie'
import { testApp, TEST_SECRET } from '../helpers/test-app'

const CREDS = {
  serverUrl: 'http://localhost:5232',
  username: 'jack',
  password: 'hunter2',
}

const authed = async (
  path: string,
  init?: RequestInit,
): Promise<Request> => {
  const cookie = (await sessionCookie(CREDS, TEST_SECRET, false)).split(
    ';',
  )[0]
  return new Request(`http://x${path}`, {
    ...init,
    headers: { ...init?.headers, cookie: cookie ?? '' },
  })
}

const LIST: TodoList = {
  id: 'chores',
  href: '/jack/chores/',
  displayName: 'Chores',
  ctag: 'ct-1',
}

describe('lists handlers', () => {
  it('401s without a session', async () => {
    const handle = createRouter(routes, testApp())
    const res = await handle(new Request('http://x/api/lists'))
    expect(res.status).toBe(401)
  })

  it('GET /api/lists returns discovered lists', async () => {
    const fetchLists = vi.fn().mockResolvedValue([LIST])
    const handle = createRouter(routes, testApp({ fetchLists }))
    const res = await handle(await authed('/api/lists'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([LIST])
  })

  it('POST /api/lists creates and returns the list', async () => {
    const createList = vi.fn().mockResolvedValue(LIST)
    const handle = createRouter(routes, testApp({ createList }))
    const res = await handle(
      await authed('/api/lists', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'chores', displayName: 'Chores' }),
      }),
    )
    expect(res.status).toBe(201)
    expect(createList).toHaveBeenCalledWith('chores', 'Chores')
  })

  it('PATCH renames, DELETE removes', async () => {
    const renameList = vi.fn().mockResolvedValue(undefined)
    const deleteList = vi.fn().mockResolvedValue(undefined)
    const handle = createRouter(routes, testApp({ renameList, deleteList }))

    const patch = await handle(
      await authed('/api/lists/chores', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: 'House chores' }),
      }),
    )
    expect(patch.status).toBe(204)
    expect(renameList).toHaveBeenCalledWith('chores', 'House chores')

    const del = await handle(
      await authed('/api/lists/chores', { method: 'DELETE' }),
    )
    expect(del.status).toBe(204)
    expect(deleteList).toHaveBeenCalledWith('chores')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- apps/server`
Expected: FAIL — 404 responses (routes not registered yet).

- [ ] **Step 3: Implement**

`apps/server/src/api/lists/list.ts`:

```ts
import { json, requireCredentials, type Route } from '../route'

// GET /api/lists — docs/specs/lists.md
export const listLists: Route = {
  method: 'GET',
  path: '/api/lists',
  handle: async (ctx) => {
    const credentials = await requireCredentials(ctx)
    const lists = await ctx.app.makeGateway(credentials).fetchLists()
    return json(lists)
  },
}
```

`apps/server/src/api/lists/create.ts`:

```ts
import { createListRequestSchema } from '@caldav-todo/schemas'
import { json, requireCredentials, type Route } from '../route'

// POST /api/lists — docs/specs/lists.md
export const createList: Route = {
  method: 'POST',
  path: '/api/lists',
  handle: async (ctx) => {
    const credentials = await requireCredentials(ctx)
    const body = createListRequestSchema.parse(await ctx.request.json())
    const list = await ctx.app
      .makeGateway(credentials)
      .createList(body.id, body.displayName)
    return json(list, 201)
  },
}
```

`apps/server/src/api/lists/rename.ts`:

```ts
import { renameListRequestSchema } from '@caldav-todo/schemas'
import { requireCredentials, type Route } from '../route'

// PATCH /api/lists/:listId — docs/specs/lists.md
export const renameList: Route = {
  method: 'PATCH',
  path: '/api/lists/:listId',
  handle: async (ctx) => {
    const credentials = await requireCredentials(ctx)
    const body = renameListRequestSchema.parse(await ctx.request.json())
    await ctx.app
      .makeGateway(credentials)
      .renameList(ctx.params['listId'] ?? '', body.displayName)
    return new Response(null, { status: 204 })
  },
}
```

`apps/server/src/api/lists/remove.ts`:

```ts
import { requireCredentials, type Route } from '../route'

// DELETE /api/lists/:listId — docs/specs/lists.md
export const removeList: Route = {
  method: 'DELETE',
  path: '/api/lists/:listId',
  handle: async (ctx) => {
    const credentials = await requireCredentials(ctx)
    await ctx.app
      .makeGateway(credentials)
      .deleteList(ctx.params['listId'] ?? '')
    return new Response(null, { status: 204 })
  },
}
```

Update `apps/server/src/api/routes.ts`:

```ts
import type { Route } from './route'
import { createList } from './lists/create'
import { listLists } from './lists/list'
import { removeList } from './lists/remove'
import { renameList } from './lists/rename'
import { createSession } from './session/create'
import { destroySession } from './session/destroy'

export const routes: Route[] = [
  createSession,
  destroySession,
  listLists,
  createList,
  renameList,
  removeList,
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- apps/server`
Expected: PASS.

- [ ] **Step 5: Lint, format, commit**

```bash
bun run lint && bun run fmt
git add -A && git commit -m "feat(server): list handlers"
```

---

### Task 7: Todo handlers (including the 412 rebase body)

**Files:**
- Create: `apps/server/src/api/todos/{list,create,update,remove}.ts`
- Modify: `apps/server/src/api/routes.ts`
- Test: `apps/server/test/handlers/todos.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/server/test/handlers/todos.test.ts`:

```ts
import type { Todo } from '@caldav-todo/schemas'
import { describe, expect, it, vi } from 'vitest'
import { CaldavError } from '../../src/caldav/errors'
import { createRouter } from '../../src/api/router'
import { routes } from '../../src/api/routes'
import { sessionCookie } from '../../src/session/cookie'
import { testApp, TEST_SECRET } from '../helpers/test-app'

const CREDS = {
  serverUrl: 'http://localhost:5232',
  username: 'jack',
  password: 'hunter2',
}

const authed = async (path: string, init?: RequestInit): Promise<Request> => {
  const cookie = (await sessionCookie(CREDS, TEST_SECRET, false)).split(';')[0]
  return new Request(`http://x${path}`, {
    ...init,
    headers: { ...init?.headers, cookie: cookie ?? '' },
  })
}

const TODO: Todo = {
  uid: 't-1',
  listId: 'chores',
  href: '/jack/chores/t-1.ics',
  etag: 'et-2',
  summary: 'Buy milk',
  completed: false,
}

describe('todos handlers', () => {
  it('GET returns todos with the collection ctag', async () => {
    const fetchTodos = vi
      .fn()
      .mockResolvedValue({ ctag: 'ct-1', todos: [TODO] })
    const handle = createRouter(routes, testApp({ fetchTodos }))
    const res = await handle(await authed('/api/lists/chores/todos'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ctag: 'ct-1', todos: [TODO] })
    expect(fetchTodos).toHaveBeenCalledWith('chores')
  })

  it('GET responds 304 when the client ctag is current', async () => {
    const fetchTodos = vi.fn().mockResolvedValue(null)
    const handle = createRouter(routes, testApp({ fetchTodos }))
    const res = await handle(
      await authed('/api/lists/chores/todos', {
        headers: { 'if-none-match': 'ct-1' },
      }),
    )
    expect(res.status).toBe(304)
    expect(fetchTodos).toHaveBeenCalledWith('chores', 'ct-1')
  })

  it('POST creates and returns the todo with its etag', async () => {
    const createTodo = vi.fn().mockResolvedValue(TODO)
    const handle = createRouter(routes, testApp({ createTodo }))
    const res = await handle(
      await authed('/api/lists/chores/todos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ uid: 't-1', summary: 'Buy milk' }),
      }),
    )
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual(TODO)
  })

  it('PUT applies changes and returns the fresh todo', async () => {
    const updateTodo = vi.fn().mockResolvedValue(TODO)
    const handle = createRouter(routes, testApp({ updateTodo }))
    const res = await handle(
      await authed('/api/lists/chores/todos/t-1', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ etag: 'et-1', changes: { completed: true } }),
      }),
    )
    expect(res.status).toBe(200)
    expect(updateTodo).toHaveBeenCalledWith('chores', 't-1', 'et-1', {
      completed: true,
    })
  })

  it('PUT conflict responds 412 WITH the fresh server copy', async () => {
    const updateTodo = vi.fn().mockRejectedValue(new CaldavError(412))
    const fetchTodo = vi.fn().mockResolvedValue(TODO)
    const handle = createRouter(routes, testApp({ updateTodo, fetchTodo }))
    const res = await handle(
      await authed('/api/lists/chores/todos/t-1', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ etag: 'stale', changes: { summary: 'x' } }),
      }),
    )
    expect(res.status).toBe(412)
    expect(await res.json()).toEqual({ todo: TODO })
  })

  it('DELETE passes the etag and 204s', async () => {
    const deleteTodo = vi.fn().mockResolvedValue(undefined)
    const handle = createRouter(routes, testApp({ deleteTodo }))
    const res = await handle(
      await authed('/api/lists/chores/todos/t-1', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ etag: 'et-2' }),
      }),
    )
    expect(res.status).toBe(204)
    expect(deleteTodo).toHaveBeenCalledWith('chores', 't-1', 'et-2')
  })

  it('DELETE conflict also responds 412 with the fresh copy', async () => {
    const deleteTodo = vi.fn().mockRejectedValue(new CaldavError(412))
    const fetchTodo = vi.fn().mockResolvedValue(TODO)
    const handle = createRouter(routes, testApp({ deleteTodo, fetchTodo }))
    const res = await handle(
      await authed('/api/lists/chores/todos/t-1', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ etag: 'stale' }),
      }),
    )
    expect(res.status).toBe(412)
    expect(await res.json()).toEqual({ todo: TODO })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- apps/server`
Expected: FAIL — 404 responses.

- [ ] **Step 3: Implement**

`apps/server/src/api/todos/list.ts`:

```ts
import { json, requireCredentials, type Route } from '../route'

// GET /api/lists/:listId/todos — docs/specs/api.md
// If-None-Match carries the client's last ctag; 304 skips the REPORT.
export const listTodos: Route = {
  method: 'GET',
  path: '/api/lists/:listId/todos',
  handle: async (ctx) => {
    const credentials = await requireCredentials(ctx)
    const gateway = ctx.app.makeGateway(credentials)
    const listId = ctx.params['listId'] ?? ''
    const knownCtag = ctx.request.headers.get('if-none-match')
    const response = knownCtag
      ? await gateway.fetchTodos(listId, knownCtag)
      : await gateway.fetchTodos(listId)
    if (response === null) return new Response(null, { status: 304 })
    return json(response)
  },
}
```

`apps/server/src/api/todos/create.ts`:

```ts
import { createTodoRequestSchema } from '@caldav-todo/schemas'
import { json, requireCredentials, type Route } from '../route'

// POST /api/lists/:listId/todos — docs/specs/api.md
export const createTodo: Route = {
  method: 'POST',
  path: '/api/lists/:listId/todos',
  handle: async (ctx) => {
    const credentials = await requireCredentials(ctx)
    const body = createTodoRequestSchema.parse(await ctx.request.json())
    const todo = await ctx.app
      .makeGateway(credentials)
      .createTodo(ctx.params['listId'] ?? '', body)
    return json(todo, 201)
  },
}
```

`apps/server/src/api/todos/update.ts`:

```ts
import { updateTodoRequestSchema } from '@caldav-todo/schemas'
import { CaldavError } from '../../caldav/errors'
import { json, requireCredentials, type Route } from '../route'

// PUT /api/lists/:listId/todos/:uid — docs/specs/api.md
// On upstream 412 the response carries the fresh copy so the client can
// rebase (docs/specs/sync-and-offline.md, conflict handling).
export const updateTodo: Route = {
  method: 'PUT',
  path: '/api/lists/:listId/todos/:uid',
  handle: async (ctx) => {
    const credentials = await requireCredentials(ctx)
    const body = updateTodoRequestSchema.parse(await ctx.request.json())
    const gateway = ctx.app.makeGateway(credentials)
    const listId = ctx.params['listId'] ?? ''
    const uid = ctx.params['uid'] ?? ''
    try {
      const todo = await gateway.updateTodo(
        listId,
        uid,
        body.etag,
        body.changes,
      )
      return json(todo)
    } catch (error) {
      if (error instanceof CaldavError && error.status === 412) {
        const fresh = await gateway.fetchTodo(listId, uid)
        return json({ todo: fresh }, 412)
      }
      throw error
    }
  },
}
```

`apps/server/src/api/todos/remove.ts`:

```ts
import { deleteTodoRequestSchema } from '@caldav-todo/schemas'
import { CaldavError } from '../../caldav/errors'
import { json, requireCredentials, type Route } from '../route'

// DELETE /api/lists/:listId/todos/:uid — docs/specs/api.md
export const removeTodo: Route = {
  method: 'DELETE',
  path: '/api/lists/:listId/todos/:uid',
  handle: async (ctx) => {
    const credentials = await requireCredentials(ctx)
    const body = deleteTodoRequestSchema.parse(await ctx.request.json())
    const gateway = ctx.app.makeGateway(credentials)
    const listId = ctx.params['listId'] ?? ''
    const uid = ctx.params['uid'] ?? ''
    try {
      await gateway.deleteTodo(listId, uid, body.etag)
      return new Response(null, { status: 204 })
    } catch (error) {
      if (error instanceof CaldavError && error.status === 412) {
        const fresh = await gateway.fetchTodo(listId, uid)
        return json({ todo: fresh }, 412)
      }
      throw error
    }
  },
}
```

Update `apps/server/src/api/routes.ts` — add the four imports and append
`listTodos, createTodo, updateTodo, removeTodo` to the array.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- apps/server`
Expected: PASS.

- [ ] **Step 5: Lint, format, commit**

```bash
bun run lint && bun run fmt
git add -A && git commit -m "feat(server): todo handlers with 412 rebase body"
```

---

### Task 8: tsdav gateway implementation

No unit tests — this is exactly what the Radicale integration suite covers
(Task 10). Writing mocked-fetch tests here would duplicate coverage against
a guess of tsdav's internals.

**Files:**
- Create: `apps/server/src/caldav/tsdav-gateway.ts`

- [ ] **Step 1: Implement**

`apps/server/src/caldav/tsdav-gateway.ts`:

```ts
import type {
  Credentials,
  NewTodo,
  Todo,
  TodoChanges,
  TodoList,
  TodosResponse,
} from '@caldav-todo/schemas'
import { applyChanges, createTodoIcs, readTodo } from '@caldav-todo/vtodo'
import { DAVClient } from 'tsdav'
import { CaldavError, CaldavUnreachableError } from './errors'
import type { CaldavGateway } from './gateway'

const VTODO_FILTER = [
  {
    'comp-filter': {
      _attributes: { name: 'VCALENDAR' },
      'comp-filter': { _attributes: { name: 'VTODO' } },
    },
  },
]

const listIdFromHref = (href: string): string =>
  href.replace(/\/+$/, '').split('/').at(-1) ?? href

const escapeXml = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')

/** Wrap upstream failures in our typed errors. */
async function translate<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof CaldavError) throw error
    if (error instanceof TypeError) {
      throw new CaldavUnreachableError(error.message)
    }
    // tsdav surfaces auth failures as thrown errors mentioning the status.
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('401') || /invalid credentials/i.test(message)) {
      throw new CaldavError(401, message)
    }
    throw new CaldavUnreachableError(message)
  }
}

function assertOk(response: { status: number; ok: boolean }): void {
  if (response.ok) return
  throw new CaldavError(response.status)
}

export function makeTsdavGateway(credentials: Credentials): CaldavGateway {
  const client = new DAVClient({
    serverUrl: credentials.serverUrl,
    credentials: {
      username: credentials.username,
      password: credentials.password,
    },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  })
  let loggedIn = false
  const ensureLogin = async (): Promise<void> => {
    if (loggedIn) return
    await translate(() => client.login())
    loggedIn = true
  }

  const authHeader = (): Record<string, string> => ({
    authorization: `Basic ${Buffer.from(
      `${credentials.username}:${credentials.password}`,
    ).toString('base64')}`,
  })

  const findCalendar = async (listId: string) => {
    const calendars = await client.fetchCalendars()
    const calendar = calendars.find(
      (entry) => listIdFromHref(entry.url) === listId,
    )
    if (!calendar) throw new CaldavError(404, `no such list: ${listId}`)
    return calendar
  }

  const toList = (calendar: {
    url: string
    displayName?: string | Record<string, unknown>
    ctag?: string
  }): TodoList => ({
    id: listIdFromHref(calendar.url),
    href: calendar.url,
    displayName:
      typeof calendar.displayName === 'string' && calendar.displayName !== ''
        ? calendar.displayName
        : listIdFromHref(calendar.url),
    ctag: String(calendar.ctag ?? ''),
  })

  const supportsVtodo = (calendar: { components?: string[] }): boolean =>
    !calendar.components || calendar.components.includes('VTODO')

  const fetchRawTodos = async (listId: string) => {
    const calendar = await findCalendar(listId)
    const objects = await client.fetchCalendarObjects({
      calendar,
      filters: VTODO_FILTER,
    })
    return { calendar, objects }
  }

  const toTodo = (
    listId: string,
    object: { url: string; etag: string; data: string },
  ): Todo | null => {
    const data = readTodo(object.data)
    if (!data) {
      console.warn(`skipping malformed calendar object: ${object.url}`)
      return null
    }
    return { ...data, listId, href: object.url, etag: object.etag }
  }

  const findRawByUid = async (listId: string, uid: string) => {
    const { objects } = await fetchRawTodos(listId)
    const match = objects.find((object) => readTodo(object.data)?.uid === uid)
    if (!match) throw new CaldavError(404, `no such todo: ${uid}`)
    return match
  }

  return {
    login: () => ensureLogin(),

    fetchLists: () =>
      translate(async () => {
        await ensureLogin()
        const calendars = await client.fetchCalendars()
        return calendars.filter(supportsVtodo).map(toList)
      }),

    createList: (id, displayName) =>
      translate(async () => {
        await ensureLogin()
        const home = client.account?.homeUrl
        if (!home) throw new CaldavError(500, 'no calendar home')
        const url = new URL(`${id}/`, home).href
        // tsdav issues a spec-compliant extended MKCOL/MKCALENDAR.
        await client.makeCalendar({
          url,
          props: { displayname: displayName },
        })
        const calendars = await client.fetchCalendars()
        const created = calendars.find(
          (entry) => listIdFromHref(entry.url) === id,
        )
        if (!created) throw new CaldavError(500, 'list not created')
        return toList(created)
      }),

    renameList: (listId, displayName) =>
      translate(async () => {
        await ensureLogin()
        const calendar = await findCalendar(listId)
        const response = await fetch(calendar.url, {
          method: 'PROPPATCH',
          headers: {
            ...authHeader(),
            'content-type': 'application/xml; charset=utf-8',
          },
          body: `<?xml version="1.0" encoding="utf-8"?>
<D:propertyupdate xmlns:D="DAV:">
  <D:set><D:prop>
    <D:displayname>${escapeXml(displayName)}</D:displayname>
  </D:prop></D:set>
</D:propertyupdate>`,
        })
        assertOk(response)
      }),

    deleteList: (listId) =>
      translate(async () => {
        await ensureLogin()
        const calendar = await findCalendar(listId)
        const response = await fetch(calendar.url, {
          method: 'DELETE',
          headers: authHeader(),
        })
        assertOk(response)
      }),

    fetchTodos: (listId, knownCtag): Promise<TodosResponse | null> =>
      translate(async () => {
        await ensureLogin()
        const calendar = await findCalendar(listId)
        const ctag = String(calendar.ctag ?? '')
        // Ctag short-circuit — docs/specs/caldav-compliance.md.
        if (knownCtag !== undefined && ctag !== '' && ctag === knownCtag) {
          return null
        }
        const objects = await client.fetchCalendarObjects({
          calendar,
          filters: VTODO_FILTER,
        })
        return {
          ctag,
          todos: objects
            .map((object) => toTodo(listId, object))
            .filter((todo): todo is Todo => todo !== null),
        }
      }),

    fetchTodo: (listId, uid) =>
      translate(async () => {
        await ensureLogin()
        const raw = await findRawByUid(listId, uid)
        const todo = toTodo(listId, raw)
        if (!todo) throw new CaldavError(500, 'malformed todo on server')
        return todo
      }),

    createTodo: (listId, input: NewTodo) =>
      translate(async () => {
        await ensureLogin()
        const calendar = await findCalendar(listId)
        const response = await client.createCalendarObject({
          calendar,
          filename: `${encodeURIComponent(input.uid)}.ics`,
          iCalString: createTodoIcs(input, new Date()),
        })
        assertOk(response)
        const raw = await findRawByUid(listId, input.uid)
        const todo = toTodo(listId, raw)
        if (!todo) throw new CaldavError(500, 'created todo unreadable')
        return todo
      }),

    updateTodo: (listId, uid, etag, changes: TodoChanges) =>
      translate(async () => {
        await ensureLogin()
        const raw = await findRawByUid(listId, uid)
        // The client edited the version it saw (`etag`). If the server
        // has moved on, that's a conflict before we even PUT.
        if (raw.etag !== etag) throw new CaldavError(412)
        const response = await client.updateCalendarObject({
          calendarObject: {
            url: raw.url,
            data: applyChanges(raw.data, changes, new Date()),
            etag,
          },
        })
        assertOk(response)
        const updated = await findRawByUid(listId, uid)
        const todo = toTodo(listId, updated)
        if (!todo) throw new CaldavError(500, 'updated todo unreadable')
        return todo
      }),

    deleteTodo: (listId, uid, etag) =>
      translate(async () => {
        await ensureLogin()
        const raw = await findRawByUid(listId, uid)
        if (raw.etag !== etag) throw new CaldavError(412)
        const response = await client.deleteCalendarObject({
          calendarObject: { url: raw.url, etag },
        })
        assertOk(response)
      }),
  }
}
```

**Note to implementer:** tsdav's exact return shapes (e.g. `displayName` as
object, error-throwing behavior) are pinned down by the integration suite in
Task 10 — if a test there fails, fix the mapping here, not the test intent.

- [ ] **Step 2: Typecheck**

Run: `bun run --filter @caldav-todo/server typecheck`
Expected: exit 0. Adjust property access to tsdav's actual types if the
compiler disagrees — the gateway interface must not change.

- [ ] **Step 3: Lint, format, commit**

```bash
bun run lint && bun run fmt
git add -A && git commit -m "feat(server): tsdav gateway implementation"
```

---

### Task 9: Server entrypoint + static serving

**Files:**
- Create: `apps/server/src/index.ts`

- [ ] **Step 1: Implement**

`apps/server/src/index.ts`:

```ts
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createRouter } from './api/router'
import { routes } from './api/routes'
import { makeTsdavGateway } from './caldav/tsdav-gateway'
import { loadConfig } from './config'

const config = loadConfig(process.env)
const handleApi = createRouter(routes, {
  config,
  makeGateway: makeTsdavGateway,
})

const clientDist = join(import.meta.dirname, '../../client/dist')

async function serveStatic(pathname: string): Promise<Response> {
  const candidate = join(clientDist, pathname === '/' ? 'index.html' : pathname)
  if (existsSync(candidate)) {
    return new Response(Bun.file(candidate))
  }
  // SPA fallback: unknown paths get index.html
  const index = join(clientDist, 'index.html')
  if (existsSync(index)) return new Response(Bun.file(index))
  return new Response('client not built', { status: 404 })
}

Bun.serve({
  port: config.PORT,
  fetch: (request) => {
    const { pathname } = new URL(request.url)
    if (pathname.startsWith('/api/')) return handleApi(request)
    return serveStatic(pathname)
  },
})

console.log(`caldav-todo server listening on :${config.PORT}`)
```

- [ ] **Step 2: Smoke test**

Run:

```bash
SESSION_SECRET=dev-secret-16-chars-min bun apps/server/src/index.ts &
sleep 1
curl -s -o /dev/null -w '%{http_code}' localhost:3000/api/lists
kill %1
```

Expected: `401` (no session — proves routing + auth wiring).

- [ ] **Step 3: Lint, format, commit**

```bash
bun run lint && bun run fmt
git add -A && git commit -m "feat(server): entrypoint with static serving"
```

---

### Task 10: Radicale integration suite

Backs the "any compliant server" claim ([testing](../specs/testing.md)).
Radicale must be installed (`uv tool install radicale` or `pipx install
radicale`); the suite **fails** (not skips) when missing so CI can't rot.

**Files:**
- Create: `apps/server/vitest.integration.config.ts`,
  `apps/server/test/integration/helpers/radicale.ts`,
  `apps/server/test/integration/gateway.test.ts`
- Modify: root `vitest.config.ts` (exclude integration from the default run)

- [ ] **Step 1: Configs**

`apps/server/vitest.integration.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
```

In root `vitest.config.ts`, exclude integration tests from the default run:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
    exclude: ['**/node_modules/**', '**/test/integration/**'],
  },
})
```

(If project-level excludes don't take effect from the root config, add the
same `exclude` to a `vitest.config.ts` inside `apps/server` instead —
verify with `bun run test` showing no integration files.)

Add to root `package.json` scripts:

```json
"test:integration": "bun run --filter @caldav-todo/server test:integration"
```

- [ ] **Step 2: Radicale spawn helper**

`apps/server/test/integration/helpers/radicale.ts`:

```ts
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface RadicaleHandle {
  url: string
  stop: () => void
}

export async function startRadicale(): Promise<RadicaleHandle> {
  const storage = mkdtempSync(join(tmpdir(), 'radicale-'))
  const port = 40000 + Math.floor(Math.random() * 10000)
  const proc = Bun.spawn(
    [
      'radicale',
      '--server-hosts',
      `127.0.0.1:${port}`,
      '--storage-filesystem-folder',
      storage,
      '--auth-type',
      'none',
    ],
    { stderr: 'pipe', stdout: 'pipe' },
  )
  const url = `http://127.0.0.1:${port}`
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    try {
      await fetch(url, { method: 'OPTIONS' })
      return { url, stop: () => proc.kill() }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }
  proc.kill()
  throw new Error(
    'radicale did not start — is it installed? (uv tool install radicale)',
  )
}
```

- [ ] **Step 3: Write the integration tests**

`apps/server/test/integration/gateway.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CaldavError } from '../../src/caldav/errors'
import type { CaldavGateway } from '../../src/caldav/gateway'
import { makeTsdavGateway } from '../../src/caldav/tsdav-gateway'
import { startRadicale, type RadicaleHandle } from './helpers/radicale'

let radicale: RadicaleHandle
let gateway: CaldavGateway

beforeAll(async () => {
  radicale = await startRadicale()
  gateway = makeTsdavGateway({
    serverUrl: `${radicale.url}/test-user/`,
    username: 'test-user',
    password: 'anything',
  })
  await gateway.login()
})

afterAll(() => radicale?.stop())

describe('tsdav gateway against radicale', () => {
  it('creates, discovers, renames and deletes lists', async () => {
    const created = await gateway.createList('chores', 'Chores')
    expect(created.displayName).toBe('Chores')

    let lists = await gateway.fetchLists()
    expect(lists.map((list) => list.id)).toContain('chores')

    await gateway.renameList('chores', 'House chores')
    lists = await gateway.fetchLists()
    expect(
      lists.find((list) => list.id === 'chores')?.displayName,
    ).toBe('House chores')

    await gateway.deleteList('chores')
    lists = await gateway.fetchLists()
    expect(lists.map((list) => list.id)).not.toContain('chores')
  })

  it('full todo CRUD with etag concurrency', async () => {
    await gateway.createList('work', 'Work')
    const created = await gateway.createTodo('work', {
      uid: 'todo-1',
      summary: 'Write report',
      priority: 'high',
      due: { kind: 'date', value: '2026-08-15' },
    })
    expect(created.etag).not.toBe('')
    expect(created.summary).toBe('Write report')

    const fetched = await gateway.fetchTodos('work')
    expect(fetched?.todos).toHaveLength(1)

    // ctag short-circuit: an unchanged collection returns null
    expect(await gateway.fetchTodos('work', fetched?.ctag ?? '')).toBeNull()

    const updated = await gateway.updateTodo(
      'work',
      'todo-1',
      created.etag,
      { completed: true },
    )
    expect(updated.completed).toBe(true)
    expect(updated.etag).not.toBe(created.etag)

    // stale etag → 412
    await expect(
      gateway.updateTodo('work', 'todo-1', created.etag, { summary: 'x' }),
    ).rejects.toThrowError(CaldavError)

    await gateway.deleteTodo('work', 'todo-1', updated.etag)
    expect((await gateway.fetchTodos('work'))?.todos).toHaveLength(0)
  })

  it('preserves foreign properties through an edit round-trip', async () => {
    await gateway.createList('foreign', 'Foreign')
    const foreignIcs = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Another Client//EN',
      'BEGIN:VTODO',
      'UID:foreign-todo',
      'DTSTAMP:20260701T120000Z',
      'SUMMARY:From another client',
      'X-OTHER-CLIENT-PROP:precious',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'TRIGGER:-PT10M',
      'DESCRIPTION:reminder',
      'END:VALARM',
      'END:VTODO',
      'END:VCALENDAR',
    ].join('\r\n')

    // PUT it the way a foreign client would (raw, odd filename).
    const put = await fetch(
      `${radicale.url}/test-user/foreign/some-odd-name.ics`,
      {
        method: 'PUT',
        headers: {
          authorization: `Basic ${Buffer.from('test-user:x').toString(
            'base64',
          )}`,
          'content-type': 'text/calendar; charset=utf-8',
        },
        body: foreignIcs,
      },
    )
    expect(put.ok).toBe(true)

    const todos = (await gateway.fetchTodos('foreign'))?.todos ?? []
    const todo = todos.find((entry) => entry.uid === 'foreign-todo')
    expect(todo).toBeDefined()
    if (!todo) return

    await gateway.updateTodo('foreign', todo.uid, todo.etag, {
      summary: 'Edited by us',
    })

    const raw = await fetch(`${radicale.url}${todo.href}`, {
      headers: {
        authorization: `Basic ${Buffer.from('test-user:x').toString(
          'base64',
        )}`,
      },
    }).then((response) => response.text())

    expect(raw).toContain('SUMMARY:Edited by us')
    expect(raw).toContain('X-OTHER-CLIENT-PROP:precious')
    expect(raw).toContain('BEGIN:VALARM')
  })
})
```

- [ ] **Step 4: Run the integration suite**

Run: `bun run test:integration`
Expected: PASS. Failures here mean the tsdav-gateway mapping (Task 8) needs
fixing — use the systematic-debugging skill; do not weaken assertions.

- [ ] **Step 5: Verify the default suite still excludes integration**

Run: `bun run test`
Expected: PASS with no `test/integration` files listed.

- [ ] **Step 6: Lint, format, commit**

```bash
bun run lint && bun run fmt
git add -A && git commit -m "test(server): radicale integration suite"
```
