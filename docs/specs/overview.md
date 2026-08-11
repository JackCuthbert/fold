# Fold — Overview

*(renamed 2026-08-01: was "CalDAV Todo Client", which named the protocol
rather than the product — CalDAV is an implementation detail the person
using this never thinks about. "Fold" is folded paper, and the fold that
tucks finished work out of sight.)*

A simple but feature-complete todo client for CalDAV servers (developed
against Radicale, compliant with any server that correctly implements the
CalDAV spec). A stateless Bun server acts as a backend-for-frontend (BFF),
exposing a clean JSON API and speaking CalDAV out the back. A React SPA
provides an offline-resilient, mobile-and-desktop UI with a minimalist serif
aesthetic.

**Product intent.** Only the features its owner actually needs — deliberately
not a Todoist competitor. Calm and unhurried: no notifications, no badges, no
streaks, nothing that nags. Elegance comes from restraint and from micro
interactions that feel considered rather than decorative.

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
  preserved untouched on edit (see [caldav-compliance](./caldav-compliance.md)).
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

- **Bun server (stateless BFF):** serves the built client and a JSON API
  under `/api` ([api](./api.md)). Uses `tsdav` for DAV operations and
  `ical.js` for iCalendar parse/serialize. No database, no server-side
  session store ([authentication](./authentication.md)).
- **React client:** renders exclusively from a local cache; all writes go
  through a durable outbox ([sync-and-offline](./sync-and-offline.md)). The
  network is an enhancement, never a dependency.

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
  specs/         Feature specifications (this directory)
  architecture/  Architecture decision docs, one per decision
  user/          User guide documentation
```

**Package rule:** code that is generic and reusable lives in `packages/` in a
publishable shape — own `package.json` with `exports`, own tests, no imports
from `apps/`. `vtodo` and `outbox` must have zero React/Bun-specific
dependencies (`outbox` accepts an injected storage adapter; the client
supplies an IndexedDB implementation).

## Tooling

- **Runtime/PM:** Bun (server, workspaces); tests run with vitest.
- **TypeScript:** v7+ (native). `tsconfig` extends `@tsconfig/strictest` +
  `@tsconfig/node24` (server/packages); client config extends strictest with
  DOM libs and bundler resolution.
- **Lint/format:** oxlint + oxfmt. CI-enforced; also run before every commit.
  *(changed 2026-07-30: linting must be type-aware — `oxlint --type-aware`,
  powered by [tsgolint](https://github.com/oxc-project/tsgolint) via the
  `oxlint-tsgolint` package; formatting is 80-char lines, no semicolons,
  dangling commas always.)*
- **Validation:** zod at every trust boundary (API in/out, outbox reads, env
  vars, CalDAV-derived data). Types inferred via `z.infer`.
- **Forms:** react-hook-form + `@hookform/resolvers/zod`, reusing
  `packages/schemas`.

## Feature specifications

| Spec | Covers |
|---|---|
| [authentication](./authentication.md) | Login, sealed-cookie sessions, logout, 401 handling |
| [lists](./lists.md) | List discovery, create/rename/delete, colours, ordering |
| [todos](./todos.md) | Todo data model, fields, completed handling |
| [list-filter](./list-filter.md) | Hiding lists from the nav and the derived views |
| [today-view](./today-view.md) | The derived Today view: scope, ordering, fetching |
| [tomorrow-view](./tomorrow-view.md) | The derived Tomorrow view: the day ahead, nothing overdue |
| [summary-view](./summary-view.md) | The derived Summary view: finished work grouped by day |
| [search-view](./search-view.md) | The derived Search view: fuzzy text search across every todo |
| [list-kinds](./list-kinds.md) | Behaviour a list's name unlocks: grouping, bulk actions, the kind marks |
| [themes](./themes.md) | Palettes, light/dark, and the self-hosted body face — browser-local |
| [sync-and-offline](./sync-and-offline.md) | Outbox, sync loop, conflicts, offline UX |
| [api](./api.md) | JSON API surface, handler convention, error mapping |
| [caldav-compliance](./caldav-compliance.md) | Round-trip preservation, CalDAV mechanisms |
| [ui](./ui.md) | Views, visual design, micro-interactions, sound |
| [testing](./testing.md) | Test layers, tools, and rules |
| [deployment](./deployment.md) | Docker image, configuration, HTTPS, health |
| [security](./security.md) | Response headers, the CSP and what it does not cover |
| [releases](./releases.md) | Semver, changelog, the published image, version in the app |
| [backlog](./backlog.md) | Pointer to GitHub Issues, plus why shipped features were settled as they were |
