# Implementation Plans — Index

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement these plans task-by-task, **in order**. Steps use checkbox (`- [ ]`) syntax for tracking.

Specifications: [docs/specs/overview.md](../specs/overview.md). Agent rules: [CLAUDE.md](../../CLAUDE.md) — read both before starting.

## Execution order

| # | Plan | Produces |
|---|---|---|
| 1 | [01-foundation.md](./01-foundation.md) | Monorepo scaffold, tooling, `packages/schemas` |
| 2 | [02-vtodo-package.md](./02-vtodo-package.md) | `packages/vtodo` — VTODO codec (tested) |
| 3 | [03-outbox-package.md](./03-outbox-package.md) | `packages/outbox` — durable queue + sync loop (tested) |
| 4 | [04-server.md](./04-server.md) | Bun BFF: auth, CalDAV gateway, API + Radicale integration tests |
| 5 | [05-client.md](./05-client.md) | React SPA: sync engine, views, micro-interactions, sound |
| 6 | [06-e2e-ci-docs.md](./06-e2e-ci-docs.md) | Playwright e2e, CI, user guides, architecture docs |

## Shared contracts (do not drift from these)

Names used across all plans. If you believe one must change, update every plan file and note it here.

**`@caldav-todo/schemas`** (zod v4; all types via `z.infer`):
`todoSchema → Todo`, `todoListSchema → TodoList`, `todoDueSchema → TodoDue`
(`{kind:'date'|'date-time', value:string}`), `todoPrioritySchema → TodoPriority`
(`'high'|'medium'|'low'`), `todoChangesSchema → TodoChanges`,
`newTodoSchema → NewTodo`, `mutationSchema → Mutation` (discriminated union on
`kind`: `createTodo | updateTodo | deleteTodo | createList | renameList | deleteList`),
`credentialsSchema → Credentials`, `sessionSchema → Session`,
`todosResponseSchema → TodosResponse` (`{ctag, todos}`), `apiErrorSchema`.

**`@caldav-todo/vtodo`:**
`readTodo(ics): VtodoData | null`, `createTodoIcs(input: NewTodo & {uid}, now: Date): string`,
`applyChanges(ics: string, changes: TodoChanges, now: Date): string`, `VtodoError`.

**`@caldav-todo/outbox`:**
`Outbox`, `SyncLoop`, `OutboxStorage`, `memoryStorage()`, `RetryableError`, `FatalError`.

**Server:** `CaldavGateway` interface (`login`, `fetchLists`, `createList`,
`renameList`, `deleteList`, `fetchTodos(listId, knownCtag?)` → response or
`null` when the ctag is unchanged, `fetchTodo`, `createTodo`, `updateTodo`,
`deleteTodo`), `CaldavError` (has `.status`), `Route` interface,
`seal`/`unseal`.

**Client API wrapper:** `api.login/logout/getSession/getLists/createList/renameList/deleteList/getTodos/createTodo/updateTodo/deleteTodo` — `getTodos(listId, knownCtag?)` returns `null` on 304; `ApiError` (has `.status`, `.body`).

## Conventions

- TDD for all logic; presentational CSS/JSX is verified visually and by e2e later.
- Commit after every green test cycle. Run `bun run lint && bun run fmt` before every commit (root scripts).
- Tests: behavior over shape. **No tests that assert a zod schema equals its own definition** — schemas are exercised through the layers that use them.
- One API handler per file. Reusable generic code goes in `packages/` (publishable shape).
