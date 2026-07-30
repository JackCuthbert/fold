# CalDAV Todo Client — Design Specification

**Date:** 2026-07-30
**Status:** Approved for planning

## Overview

A simple but feature-complete todo client for CalDAV servers (developed against
Radicale, compliant with any server that correctly implements the CalDAV spec).
A stateless Bun server acts as a backend-for-frontend (BFF), exposing a clean
JSON API and speaking CalDAV out the back. A React SPA provides an
offline-resilient, mobile-and-desktop UI with a minimalist serif aesthetic.

## Goals

- Sync to the CalDAV server on every user action.
- Fully usable during network/server loss: all reads and writes work offline,
  queued writes replay when connectivity returns.
- Multiple list (CalDAV collection) support, including create/rename/delete.
- CalDAV spec compliance: works against any correctly-implemented server, and
  never destroys data it does not understand.
- Micro-interactions for delight; optional completion sounds (stretch).
- Mobile + desktop responsive views.

## Non-goals (future enhancements)

- **Sub-tasks** (RELATED-TO hierarchies) — explicitly deferred.
- Recurring todos (RRULE) — out of scope; existing RRULE properties are
  preserved untouched on edit.
- Service worker / background sync while the tab is closed.
- Multi-account simultaneous sessions.

## Architecture

```
┌────────────────┐   JSON over HTTP    ┌────────────────┐   CalDAV (WebDAV)   ┌──────────┐
│  React client  │ ◄─────────────────► │  Bun BFF       │ ◄─────────────────► │ Radicale │
│  TanStack Query│                     │  tsdav +       │                     │ (or any  │
│  + IDB outbox  │                     │  ical.js       │                     │  server) │
└────────────────┘                     └────────────────┘                     └──────────┘
```

- **Bun server (stateless BFF):** serves the built client and a JSON API under
  `/api`. Uses `tsdav` for DAV operations and `ical.js` for iCalendar
  parse/serialize. No database, no server-side session store.
- **React client:** renders exclusively from a local cache; all writes go
  through a durable outbox. The network is an enhancement, never a dependency.

### Authentication

- Login form (react-hook-form + zod resolver) posts CalDAV server URL,
  username, and password to `POST /api/session`.
- The server verifies credentials via CalDAV principal discovery
  (`current-user-principal`), then seals `{serverUrl, username, password}`
  into an **encrypted httpOnly cookie** (AES-256-GCM, key from
  `SESSION_SECRET` env var). SameSite=Strict; Secure outside dev.
- Every API request unseals the cookie and constructs a tsdav client.
  Stateless: survives server restarts, no session table.
- `DELETE /api/session` clears the cookie. A 401 from the CalDAV server maps
  to a 401 from the API, which routes the client to the login screen.

## Workspace layout

Bun workspaces monorepo:

```
apps/
  server/        Bun BFF — API handlers, CalDAV gateway
  client/        React SPA
packages/
  schemas/       Zod schemas + inferred types (the shared trust boundary)
  vtodo/         VTODO codec: parse / mutate-preserve / serialize (wraps ical.js)
  outbox/        Generic durable FIFO mutation queue (storage-injectable)
e2e/             Playwright happy-path tests
docs/
```

**Package rule:** code that is generic and reusable lives in `packages/` in a
publishable shape — own `package.json` with `exports`, own tests, no imports
from `apps/`. `vtodo` and `outbox` must have zero React/Bun-specific
dependencies (`outbox` accepts an injected storage adapter; the client
supplies an IndexedDB implementation).

## Server design

### API surface

| Method & path | Purpose | CalDAV mechanism |
|---|---|---|
| `POST /api/session` | Login | principal discovery |
| `DELETE /api/session` | Logout | — |
| `GET /api/lists` | Discover todo lists | PROPFIND for collections supporting VTODO |
| `POST /api/lists` | Create list | MKCALENDAR (fallback: extended MKCOL) |
| `PATCH /api/lists/:listId` | Rename list | PROPPATCH `displayname` |
| `DELETE /api/lists/:listId` | Delete list | DELETE on collection |
| `GET /api/lists/:listId/todos` | Fetch todos + ETags + ctag | calendar-query REPORT (`VTODO` filter) |
| `POST /api/lists/:listId/todos` | Create todo | PUT with `If-None-Match: *` |
| `PUT /api/lists/:listId/todos/:uid` | Update todo | GET → mutate → PUT with `If-Match: <etag>` |
| `DELETE /api/lists/:listId/todos/:uid` | Delete todo | DELETE with `If-Match: <etag>` |

- List and todo identifiers in URLs are derived from CalDAV hrefs/UIDs,
  URL-encoded. Responses carry the fields defined in `packages/schemas`.
- Every request body and response is validated with zod at the boundary.
  Invalid input → 400 with a structured error body.
- CalDAV `412 Precondition Failed` passes through as API 412 (with the fresh
  todo in the response body so the client can rebase). CalDAV 401 → API 401.
  Unreachable CalDAV server → 502, distinguishing "you're offline" from
  "your CalDAV server is down" in the client.

### Handler convention

One handler per file: `apps/server/src/api/<resource>/<action>.ts`
(e.g. `api/todos/update.ts`). Each file exports the route definition
(method, path, zod input/output schemas, handler function). A small router
composes them. No monolithic route files.

### Round-trip preservation (spec-compliance cornerstone)

Updates never regenerate a VTODO from our model. The flow is:

1. GET the existing `.ics` from the CalDAV server (with its ETag).
2. Parse with ical.js; locate the VTODO component.
3. Mutate **only managed properties**: `SUMMARY`, `STATUS`, `PERCENT-COMPLETE`,
   `COMPLETED`, `DUE`, `DESCRIPTION`, `PRIORITY`, `DTSTAMP`, `LAST-MODIFIED`,
   `SEQUENCE` (incremented).
4. Serialize the whole calendar object back — VALARMs, X-properties,
   RELATED-TO, RRULE, unknown components, and other VTODOs in the same
   resource all pass through untouched.
5. PUT with `If-Match`.

This mutate-preserve logic lives in `packages/vtodo` and is heavily tested.

## Shared data model (`packages/schemas`)

Zod schemas are the single source of truth; TypeScript types are inferred
(`z.infer`). Key entities:

- **TodoList:** `id`, `href`, `displayName`, `ctag`.
- **Todo:** `uid`, `listId`, `href`, `etag`, `summary`, `completed` (boolean,
  derived from `STATUS:COMPLETED`; setting it writes `STATUS`,
  `PERCENT-COMPLETE:100`, and `COMPLETED` timestamp), `due?` (date or
  date-time, timezone-aware), `description?`, `priority?`
  (`high` | `medium` | `low` ↔ PRIORITY 1 | 5 | 9; absent/0 = none; on read,
  1–4 → high, 5 → medium, 6–9 → low).
- **Session:** server URL + username (never the password) for display.
- **Mutation:** discriminated union of outbox entries
  (`createTodo`, `updateTodo`, `deleteTodo`, `createList`, `renameList`,
  `deleteList`) — zod-validated when read back from IndexedDB.

## Client design

### State & sync engine

- **Reads:** TanStack Query, persisted to IndexedDB via `persistQueryClient`.
  Cached lists and todos render instantly on load, offline included.
- **Writes:** custom outbox (`packages/outbox`). Every action:
  1. Optimistically updates the TanStack Query cache.
  2. Appends a `Mutation` to the durable outbox.
  3. The sync loop drains the outbox FIFO against the JSON API.
- **Sync loop:** triggered by outbox append, `online` event, window focus, and
  a periodic timer. Exponential backoff with jitter on failure (cap ~30s).
  Entries are coalesced where safe (two updates to the same todo merge; a
  create followed by updates merges into the create; create+delete cancels
  out).
- **Conflict handling (last-write-wins):** update carries the ETag the client
  last saw. On 412 the client takes the fresh copy from the response, rebases
  its managed-field changes on top, and retries once with the new ETag. If
  that also fails, drop the mutation, surface a toast ("Couldn't save
  '<summary>' — it changed on the server"), and refetch.
- **Offline detection:** `navigator.onLine` + fetch failures. Header shows an
  offline pill and a queued-changes count. 502 (CalDAV server down, network
  up) shows a distinct "server unreachable" pill; queue behavior is identical.

### Views & interaction

- **Desktop (≥768px):** persistent sidebar of lists + main todo pane.
- **Mobile:** list switcher in a drawer/sheet; single-pane todo view.
- **Todo pane:** quick-add input at top (Enter to add, stays focused for rapid
  entry); active todos sorted by (overdue first, then due date, then priority,
  then creation); tap/click a todo to open a detail view (mobile: sheet;
  desktop: inline panel) for editing summary, due date, notes, priority.
- **Completed:** collapsible "Completed" section per list with count and
  "Clear completed" (deletes on server, with confirm).
- **Forms:** all forms (login, todo detail, list create/rename) use
  react-hook-form with `@hookform/resolvers/zod`, reusing `packages/schemas`.
- **Destructive actions** (delete list, clear completed) require confirmation.

### Visual design

- Minimalist. System serif stack:
  `Charter, 'Bitstream Charter', 'Sitka Text', Cambria, Georgia, serif` —
  elegant, zero font-loading jank.
- Type scale: 14px minimum anywhere; **all inputs 16px** (prevents iOS
  auto-zoom). Generous whitespace, restrained palette (paper-white background,
  near-black ink, one accent), light/dark via `prefers-color-scheme`.
- **Micro-interactions:** animated checkbox (SVG stroke draw on check),
  strikethrough sweep + gentle settle into the completed section, item
  enter/exit transitions, subtle press feedback on buttons. All gated behind
  `prefers-reduced-motion`.
- **Sound (stretch):** short synthesized "pop" via Web Audio API on completion
  (no audio assets). On by default, mute toggle in the header, persisted to
  localStorage. Never plays when `prefers-reduced-motion` is set.

## Error handling summary

| Failure | Behavior |
|---|---|
| Network offline | Offline pill; all actions queue; replay on reconnect |
| CalDAV server down (502) | "Server unreachable" pill; identical queueing |
| ETag conflict (412) | Rebase + retry once → else toast + refetch |
| Auth expired/revoked (401) | Route to login; outbox preserved and replays after re-login |
| Invalid API input (400) | Client-side bug; toast + error boundary logging |
| Malformed VTODO from server | Skip item, log warning, render the rest (never crash the list) |

## Testing strategy

- **vitest (unit/component):**
  - `packages/vtodo`: mutate-preserve round-tripping (property-preservation
    assertions against fixture `.ics` files including VALARMs, X-props,
    folded lines, timezones), status/priority mapping behavior.
  - `packages/outbox`: FIFO ordering, coalescing rules, backoff, persistence
    across "restarts" (fresh instance over same storage).
  - Client sync logic: optimistic update + rollback, 412 rebase flow, 401 flow.
  - Server handlers: request→CalDAV-call mapping with a mocked tsdav layer.
- **Integration (vitest, CI):** API tests against a real Radicale instance
  (spawned in CI via pip/uv). Full CRUD for lists and todos, conflict
  scenarios, preservation of foreign properties. This backs the "any
  compliant server" claim.
- **Playwright (e2e happy paths only):** login → create list → add todos →
  complete → clear completed; offline scenario via `context.setOffline(true)`
  verifying queue + replay; mobile viewport variant.
- **Test rules:** no duplicated coverage across layers; test behavior, not
  shape (no asserting a schema equals its definition).

## Tooling

- **Runtime/PM:** Bun (server, workspaces, test runner stays vitest).
- **TypeScript:** v7+ (native). `tsconfig` extends `@tsconfig/strictest` +
  `@tsconfig/node24` (server/packages); client config extends strictest with
  DOM libs and bundler resolution.
- **Lint/format:** oxlint + oxfmt. CI-enforced; also run before every commit.
- **Validation:** zod at every trust boundary (API in/out, outbox reads,
  env vars, CalDAV-derived data).
- **Forms:** react-hook-form + zod resolver.

## Agent rules (to live in CLAUDE.md)

- Always lint (`oxlint`) and format (`oxfmt`) before committing.
- Don't duplicate tests across layers.
- Test behavior over shape — never test that a defined shape is what it is.
- Use zod for runtime validation with inferred static types; validate at
  every trust boundary.
- All tsconfigs extend the `@tsconfig/strictest` base (+ `node24` where
  server-side).
- Forms use react-hook-form with the zod resolver.
- API handlers are individual files — one route per file, composed by a
  small router. No giant files.
- Generic, reusable, feature-complete code goes in `packages/` in
  publishable shape: own `package.json` + `exports`, own tests, no
  app-directory imports.
