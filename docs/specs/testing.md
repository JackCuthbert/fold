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

API tests against a **real Radicale instance**, spawned as a throwaway
Docker container per run (never a `radicale` binary on PATH — see
`apps/server/test/integration/helpers/radicale.ts` and
`e2e/helpers/radicale-container.ts`; *(changed 2026-07-31: previously
installed via pip/uv, which violated the "never install system/user-wide"
rule in CLAUDE.md)*):

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
4. Stale session: sign in, `context.clearCookies()` (the session cookie is
   httpOnly — page JS can't touch it, so this is the only way to simulate
   "cookie gone" from a test), reload, assert the login form renders — not
   a populated shell from cache
   ([authentication](./authentication.md#the-session-is-never-served-from-cache)).
   *(added 2026-07-31: every other spec signs in fresh within a single page
   load, so none of them could have caught the stale-persisted-`['session']`
   bug fixed in `84244ff` — this case exists specifically to close that
   gap.)*

## One CalDAV account per test

*(added 2026-08-05.)*

`login()` signs in as a user derived from the running test's title, so
**every spec starts from an empty nav**. The container runs with
`[auth] type = none`, so this costs nothing — no account setup, no
cleanup, and storage dies with the container.

Every spec used to share one `e2e-user`, which meant sharing one nav, and
that produced three separate failures in one day — each of which looked
like a product bug and wasn't:

- A reorder spec assumed its two lists were **adjacent**. "Move up" swaps
  with the immediate neighbour, so it broke the moment another spec's list
  sorted between them.
- A count assumed only its **own** todos were in Today. The derived views
  span every list, so another spec completing something due today changed
  the header.
- A header timed out waiting for "No todos" on a fresh list, because
  eighteen accumulated lists each cost a conditional request before first
  paint.

All three passed locally on four workers and failed on CI's one, where
specs run in sequence and every later test inherits everything earlier
ones made. **Never assert on anything a test did not create itself** — and
with an account per test, "everything on the server" is now exactly that.

## Reloading in an e2e test

*(added 2026-08-04, issue #8.)*

A reload in a test almost always means **"prove it reached the server"** —
but a plain `page.reload()` proves no such thing. The query cache is
persisted to IndexedDB and restored on load, and with `staleTime: 30_000`
(deliberate, offline-first — [sync-and-offline](./sync-and-offline.md)) the
restored snapshot isn't refetched for up to 30s. So the assertion after a
plain reload may be answered by the cache, and it can pass or fail for
reasons that have nothing to do with what it claims to test.

- Use the `reloadFromServer` helper, which drops the persisted cache first,
  whenever the point is that a change is really on the server.
- Use a plain `page.reload()` only when the test is *about* restoring from
  cache — and say so in a comment, so the difference reads as deliberate.
- The trap is sharpest for assertions about **absence**: a deleted todo
  reappearing from a restored snapshot is exactly the flake this rule was
  written for.

## Rules

- Don't duplicate tests across layers — if the outbox unit tests cover
  coalescing, the e2e suite doesn't re-test coalescing.
- Test behavior over shape.
- Integration and e2e suites must be runnable locally with one command each.
