# JSON API

The Bun BFF exposes a JSON API under `/api`. It is the only thing the client
talks to; all CalDAV happens server-side
([caldav-compliance](./caldav-compliance.md)).

## Surface

| Method & path | Purpose | CalDAV mechanism |
|---|---|---|
| `POST /api/session` | Login | principal discovery ([authentication](./authentication.md)) |
| `DELETE /api/session` | Logout | — |
| `GET /api/lists` | Discover todo lists | PROPFIND ([lists](./lists.md)) |
| `POST /api/lists` | Create list | MKCALENDAR with name, colour and order (fallback: extended MKCOL) |
| `PATCH /api/lists/:listId` | Update list — any subset of name, colour, order | PROPPATCH `displayname`, and a second PROPPATCH for `calendar-color` / `calendar-order` |
| `DELETE /api/lists/:listId` | Delete list | DELETE on collection |
| `GET /api/lists/:listId/todos` | Todos + ETags + ctag | calendar-query REPORT (`VTODO` filter) |
| `POST /api/lists/:listId/todos` | Create todo | PUT with `If-None-Match: *` |
| `PUT /api/lists/:listId/todos/:uid` | Update todo | GET → mutate → PUT with `If-Match` |
| `DELETE /api/lists/:listId/todos/:uid` | Delete todo | DELETE with `If-Match` |

- Identifiers in URLs are derived from CalDAV hrefs/UIDs, URL-encoded.
- `PATCH /api/lists/:listId` is **one API call but up to two CalDAV
  requests** — to the user a name and a colour are a single edit, while
  `displayname` and the Apple extension properties are different properties
  on the server. *(added 2026-08-03: was rename-only. See
  [lists — operations](./lists.md#operations).)*
- Request and response bodies use the schemas in `packages/schemas`
  ([todos](./todos.md), [lists](./lists.md)) and are zod-validated at the
  boundary in both directions. Invalid input → 400 with a structured error
  body.

## Handler convention

One handler per file: `apps/server/src/api/<resource>/<action>.ts`
(e.g. `api/todos/update.ts`). Each file exports the route definition —
method, path, zod input/output schemas, handler function. A small router
composes them. No monolithic route files.

## Error mapping

| Upstream condition | API response | Client behavior ([sync-and-offline](./sync-and-offline.md)) |
|---|---|---|
| CalDAV 401 | 401 | route to login |
| CalDAV 412 | 412 + fresh todo in body | rebase + retry |
| CalDAV 404 (no such list/todo) | 404 | drop the mutation; the target is gone, retrying cannot help |
| CalDAV server unreachable | 502 | "server unreachable" pill, keep queueing |
| Invalid request body | 400 + structured error | toast + error logging |

*(added 2026-07-31: the router previously flattened **every** non-401/412
`CaldavError` to 502, so a 404 for a deleted list was reported as "server
unreachable". Combined with 5xx-is-retryable, that produced an endless
retry loop against a list that no longer exists and a permanently
"unreachable" UI while the server was answering normally. A `CaldavError`
must preserve its own status for 4xx; only genuinely unreachable upstreams
map to 502.)*

*(changed 2026-07-31: the client treats **any 5xx** — not only the
documented 502 — as transient and keeps queueing. A 500/503/504 can
originate from an intermediary in front of this API (reverse proxy, load
balancer, CDN) and is never the client's fault, so it must retry rather
than drop the mutation; only 4xx is treated as a client-side/fatal error,
with 401/412 handled specially as above.)*

## Spurious vs. genuine unreachable

*(added 2026-07-31: against a healthy local Radicale, roughly 1 request in
4 was reported as `caldav_unreachable` (502) under ordinary concurrent
usage — reproduced deterministically by firing concurrent bursts at
`GET /api/lists`. Instrumenting `translate()` in
`apps/server/src/caldav/tsdav-gateway.ts` showed every failure was the
exact same error, thrown from inside tsdav's internal requests: `"The
socket connection was closed unexpectedly"` — Bun's fetch dropping an
idle/reused connection under concurrent load, never a real error from
Radicale. Each API request builds a fresh `DAVClient` per
[authentication](./authentication.md)'s stateless-per-request design, so
ordinary concurrent usage opens far more simultaneous sockets against
Radicale than "one request per user action" suggests.

Fixed via a `fetch` override passed into `DAVClient` (`makeFetchWithRetry`
in tsdav-gateway.ts), retrying only idempotent/safe methods
(GET/HEAD/OPTIONS/PROPFIND/REPORT) a bounded number of times on that exact
error. Mutating methods (PUT/DELETE/PROPPATCH/MKCALENDAR/POST) are
deliberately left unretried at this layer: create/update/delete already
carry ETag preconditions (`If-None-Match`/`If-Match` above), so blindly
retrying a write whose reset happened after it reached the server risks a
spurious 412 instead of the honest failure. A server that is genuinely
down still fails every attempt and correctly surfaces as 502 — this only
absorbs the spurious, connection-level case, per the "distinguish
spurious from real" requirement above.)*
