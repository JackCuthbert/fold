# Testing Strategy

Three layers, no duplicated coverage between them. Test behavior, not shape —
never assert that a defined schema equals its definition.

## Unit / component (vitest)

- **`packages/vtodo`:** mutate-preserve round-tripping against fixture `.ics`
  files (VALARMs, X-props, folded lines, timezones, multiple VTODOs per
  resource); status/priority mapping behavior
  ([caldav-compliance](./caldav-compliance.md), [todos](./todos.md)).
- **`packages/outbox`:** FIFO ordering, coalescing rules, backoff,
  persistence across "restarts" (fresh instance over the same storage)
  ([sync-and-offline](./sync-and-offline.md)).
- **Client sync logic:** optimistic update + rollback, 412 rebase flow,
  401 → login flow.
- **Server handlers:** request → CalDAV-call mapping with a mocked tsdav
  layer ([api](./api.md)).

## Integration (vitest, CI)

API tests against a **real Radicale instance** (spawned in CI via pip/uv):

- Full CRUD for lists and todos.
- Conflict scenarios (412 paths).
- Preservation of foreign properties through an edit round-trip.

This layer backs the "any compliant server" claim in
[caldav-compliance](./caldav-compliance.md).

## E2E happy paths (Playwright)

Happy paths only:

1. Login → create list → add todos → complete → clear completed.
2. Offline: `context.setOffline(true)` → make changes → reconnect → verify
   queue replay ([sync-and-offline](./sync-and-offline.md)).
3. Mobile viewport variant of path 1 ([ui](./ui.md)).

## Rules

- Don't duplicate tests across layers — if the outbox unit tests cover
  coalescing, the e2e suite doesn't re-test coalescing.
- Test behavior over shape.
- Integration and e2e suites must be runnable locally with one command each.
