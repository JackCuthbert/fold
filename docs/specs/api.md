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
| `POST /api/lists` | Create list | MKCALENDAR (fallback: extended MKCOL) |
| `PATCH /api/lists/:listId` | Rename list | PROPPATCH `displayname` |
| `DELETE /api/lists/:listId` | Delete list | DELETE on collection |
| `GET /api/lists/:listId/todos` | Todos + ETags + ctag | calendar-query REPORT (`VTODO` filter) |
| `POST /api/lists/:listId/todos` | Create todo | PUT with `If-None-Match: *` |
| `PUT /api/lists/:listId/todos/:uid` | Update todo | GET → mutate → PUT with `If-Match` |
| `DELETE /api/lists/:listId/todos/:uid` | Delete todo | DELETE with `If-Match` |

- Identifiers in URLs are derived from CalDAV hrefs/UIDs, URL-encoded.
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
