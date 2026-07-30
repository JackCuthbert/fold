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
| CalDAV server unreachable | 502 | "server unreachable" pill, keep queueing |
| Invalid request body | 400 + structured error | toast + error logging |
