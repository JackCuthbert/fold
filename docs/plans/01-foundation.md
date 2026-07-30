# Plan 01: Foundation — Monorepo, Tooling, Schemas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Bun-workspaces monorepo with TS7 strictest configs, type-aware oxlint, oxfmt (80 cols, no semis, dangling commas), vitest, and the `@caldav-todo/schemas` package.

**Architecture:** Root holds shared tooling config; every package/app extends `tsconfig.base.json` and is linted/formatted from the root. `packages/schemas` is the shared trust boundary — zod v4 schemas, types via `z.infer`, consumed by everything else. Spec: [overview](../specs/overview.md).

**Tech Stack:** Bun workspaces, TypeScript 7, oxlint + [tsgolint](https://github.com/oxc-project/tsgolint) (type-aware linting, via the `oxlint-tsgolint` package), oxfmt, vitest, zod v4.

**Formatting rules (apply to ALL code in ALL plans):** 80-char lines, no semicolons, trailing commas always. The code blocks in these plans follow this style — keep it.

---

### Task 1: Repository scaffold and tooling

**Files:**
- Create: `.gitignore`, `package.json`, `tsconfig.base.json`, `.oxlintrc.json`, `.oxfmtrc.json`, `vitest.config.ts`, `README.md`

- [ ] **Step 1: Write root config files**

`.gitignore`:

```
node_modules/
dist/
*.tsbuildinfo
.env
test-results/
playwright-report/
```

`package.json`:

```json
{
  "name": "caldav-todo-client",
  "private": true,
  "type": "module",
  "workspaces": ["apps/*", "packages/*", "e2e"],
  "scripts": {
    "lint": "oxlint --type-aware",
    "fmt": "oxfmt",
    "fmt:check": "oxfmt --check",
    "typecheck": "bun run --filter '*' typecheck",
    "test": "vitest run"
  }
}
```

`tsconfig.base.json`:

```json
{
  "extends": [
    "@tsconfig/strictest/tsconfig.json",
    "@tsconfig/node24/tsconfig.json"
  ],
  "compilerOptions": {
    "module": "preserve",
    "moduleResolution": "bundler",
    "noEmit": true
  }
}
```

`.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "categories": {
    "correctness": "error",
    "suspicious": "error",
    "perf": "warn"
  },
  "ignorePatterns": ["dist", "node_modules"]
}
```

`.oxfmtrc.json`:

```json
{
  "printWidth": 80,
  "semi": false,
  "trailingComma": "all"
}
```

`README.md`:

```markdown
# caldav-todo-client

A simple, offline-resilient todo client for any spec-compliant CalDAV
server. See [docs/specs/overview.md](docs/specs/overview.md).
```

- [ ] **Step 2: Install root dev dependencies**

Type-aware linting requires `oxlint-tsgolint` alongside `oxlint` —
`--type-aware` shells out to the tsgolint binary
(https://github.com/oxc-project/tsgolint) and errors without it.

Run:

```bash
bun add -d typescript@^7 oxlint oxlint-tsgolint oxfmt vitest @tsconfig/strictest @tsconfig/node24
```

Expected: lockfile written, no errors. If `oxfmt` rejects an option name in
`.oxfmtrc.json`, check `oxfmt --help` and map to the equivalent option —
the three rules (80 cols, no semis, dangling commas) are non-negotiable.
Likewise, if `--type-aware` is unavailable in the installed oxlint version,
check `oxlint --help` for the current flag name rather than dropping
type-aware linting.

- [ ] **Step 3: Write root vitest config**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
  },
})
```

- [ ] **Step 4: Verify tooling runs clean**

Run: `bun run lint && bun run fmt:check`
Expected: both exit 0 (no source files yet). tsgolint resolves each file's
`tsconfig.json` from the nearest package, so the root having no `include`
is fine — re-verify in Task 2 Step 4 once real source exists.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: monorepo scaffold with tooling"
```

---

### Task 2: `packages/schemas`

The shared trust boundary ([overview](../specs/overview.md),
[todos](../specs/todos.md), [lists](../specs/lists.md),
[sync-and-offline](../specs/sync-and-offline.md)).

**No unit tests in this task** — agent rule: never test that a defined shape
is what it is. These schemas are exercised behaviorally by every later plan
(vtodo mapping tests, outbox validation tests, server boundary tests).

**Files:**
- Create: `packages/schemas/package.json`, `packages/schemas/tsconfig.json`,
  `packages/schemas/src/{index,list,todo,session,mutation,api}.ts`

- [ ] **Step 1: Package scaffold**

`packages/schemas/package.json`:

```json
{
  "name": "@caldav-todo/schemas",
  "version": "0.1.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit" },
  "dependencies": { "zod": "^4.0.0" },
  "devDependencies": { "typescript": "^7.0.0" }
}
```

`packages/schemas/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

Run: `bun install`

- [ ] **Step 2: Write the schemas**

`packages/schemas/src/list.ts`:

```ts
import { z } from 'zod'

export const todoListSchema = z.object({
  id: z.string().min(1),
  href: z.string().min(1),
  displayName: z.string().min(1),
  ctag: z.string(),
})
export type TodoList = z.infer<typeof todoListSchema>
```

`packages/schemas/src/todo.ts`:

```ts
import { z } from 'zod'

// Four RFC 5545 DUE forms, preserved as sent — see
// docs/specs/todos.md#due-dates-and-timezones. Never convert between forms.
const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/

export const todoDueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('date'), value: z.iso.date() }),
  z.object({
    kind: z.literal('utc'),
    value: z.iso.datetime({ offset: false }),
  }),
  z.object({
    kind: z.literal('floating'),
    value: z.string().regex(LOCAL_DATE_TIME),
  }),
  z.object({
    kind: z.literal('zoned'),
    tzid: z.string().min(1),
    value: z.string().regex(LOCAL_DATE_TIME),
  }),
])
export type TodoDue = z.infer<typeof todoDueSchema>

export const todoPrioritySchema = z.enum(['high', 'medium', 'low'])
export type TodoPriority = z.infer<typeof todoPrioritySchema>

export const todoSchema = z.object({
  uid: z.string().min(1),
  listId: z.string().min(1),
  href: z.string().min(1),
  etag: z.string().min(1),
  summary: z.string(),
  completed: z.boolean(),
  due: todoDueSchema.optional(),
  description: z.string().optional(),
  priority: todoPrioritySchema.optional(),
})
export type Todo = z.infer<typeof todoSchema>

export const newTodoSchema = z.object({
  uid: z.string().min(1),
  summary: z.string().min(1),
  due: todoDueSchema.optional(),
  description: z.string().optional(),
  priority: todoPrioritySchema.optional(),
})
export type NewTodo = z.infer<typeof newTodoSchema>

// Partial edit; explicit null clears an optional property.
export const todoChangesSchema = z
  .object({
    summary: z.string().min(1),
    completed: z.boolean(),
    due: todoDueSchema.nullable(),
    description: z.string().nullable(),
    priority: todoPrioritySchema.nullable(),
  })
  .partial()
export type TodoChanges = z.infer<typeof todoChangesSchema>
```

`packages/schemas/src/session.ts`:

```ts
import { z } from 'zod'

export const credentialsSchema = z.object({
  serverUrl: z.url(),
  username: z.string().min(1),
  password: z.string().min(1),
})
export type Credentials = z.infer<typeof credentialsSchema>

export const sessionSchema = credentialsSchema.omit({ password: true })
export type Session = z.infer<typeof sessionSchema>
```

`packages/schemas/src/mutation.ts`:

```ts
import { z } from 'zod'
import { newTodoSchema, todoChangesSchema } from './todo'

const base = { id: z.uuid() }
const listId = z.string().min(1)
const uid = z.string().min(1)

// Outbox entries. Validated when read back from storage —
// see docs/specs/sync-and-offline.md.
export const mutationSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('createTodo'), listId, todo: newTodoSchema }),
  z.object({
    ...base,
    kind: z.literal('updateTodo'),
    listId,
    uid,
    etag: z.string(),
    changes: todoChangesSchema,
  }),
  z.object({ ...base, kind: z.literal('deleteTodo'), listId, uid, etag: z.string() }),
  z.object({
    ...base,
    kind: z.literal('createList'),
    listId,
    displayName: z.string().min(1),
  }),
  z.object({
    ...base,
    kind: z.literal('renameList'),
    listId,
    displayName: z.string().min(1),
  }),
  z.object({ ...base, kind: z.literal('deleteList'), listId }),
])
export type Mutation = z.infer<typeof mutationSchema>
```

`packages/schemas/src/api.ts`:

```ts
import { z } from 'zod'
import { todoListSchema } from './list'
import { newTodoSchema, todoChangesSchema, todoSchema } from './todo'

export const listsResponseSchema = z.array(todoListSchema)

export const todosResponseSchema = z.object({
  ctag: z.string(),
  todos: z.array(todoSchema),
})
export type TodosResponse = z.infer<typeof todosResponseSchema>

export const createListRequestSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
})
export const renameListRequestSchema = z.object({
  displayName: z.string().min(1),
})

export const createTodoRequestSchema = newTodoSchema
export const updateTodoRequestSchema = z.object({
  etag: z.string().min(1),
  changes: todoChangesSchema,
})
export const deleteTodoRequestSchema = z.object({
  etag: z.string().min(1),
})

// 412 responses carry the fresh server copy for client rebase —
// see docs/specs/api.md (error mapping).
export const conflictResponseSchema = z.object({ todo: todoSchema })

export const apiErrorBodySchema = z.object({
  error: z.string(),
  message: z.string(),
})
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>
```

`packages/schemas/src/index.ts`:

```ts
export * from './api'
export * from './list'
export * from './mutation'
export * from './session'
export * from './todo'
```

- [ ] **Step 3: Typecheck**

Run: `bun run --filter @caldav-todo/schemas typecheck`
Expected: exit 0, no errors.

- [ ] **Step 4: Lint + format**

Run: `bun run lint && bun run fmt`
Expected: exit 0. `git diff` shows no reformatting (code was written to
style).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(schemas): shared zod schemas package"
```
