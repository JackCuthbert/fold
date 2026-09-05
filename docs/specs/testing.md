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
- **CLI:** command behavior, output and error contracts with injected HTTP,
  prompt and session-store boundaries. The packaged executable's critical
  journey belongs in integration coverage rather than being repeated here
  ([agentic-todo-management](./agentic-todo-management.md)).
  *(changed 2026-09-04: added the CLI unit-test boundary for issue #91.)*

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

## E2E (Playwright)

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

### Two modes: one real CalDAV path, the rest mocked

*(added 2026-08-14, issue #54.)*

Every spec used to talk to one shared Radicale container under
`cores / 2` workers, so most of what the suite waited on was that
container's throughput rather than the app. Different tests failed each
run, always on a 30s timeout, always passing alone.

The suite now runs **two app servers**, and a spec's project decides which
it gets:

| Project | Port | Gateway | Covers |
|---|---|---|---|
| `desktop-real` | 3300 | real tsdav → Radicale | `real-caldav.spec.ts` only |
| `desktop`, `mobile`, `screenshot` | 3301 | in-memory fake | everything else |

**The mocked boundary is the BFF's outbound edge, not the browser's.**
`CALDAV_FAKE=1` swaps `makeGateway` for an in-memory implementation of the
same `CaldavGateway` interface (`apps/server/src/caldav/fake-gateway.ts`).
The client, the router, session sealing, the handlers, response validation
and error mapping are all real — only tsdav's conversation with a CalDAV
server is replaced. Mocking `/api/**` with `page.route` would have taken
the whole BFF out of the test instead, since Playwright only sees requests
the *browser* makes. See
[architecture/e2e-fake-caldav-gateway](../architecture/e2e-fake-caldav-gateway.md).

**Which spec is the real one, and why.** `real-caldav.spec.ts`, a single
journey: create, edit, complete, move, delete, reload, persist. It is the
only test that needs to prove the CalDAV round trip genuinely works — real
MKCALENDAR, PROPPATCH, PUT with preconditions, REPORT, ETags and ctags,
real iCalendar through `packages/vtodo`. It is one test rather than the
eleven `happy-path.spec.ts` used to hold, because the other ten were about
modals, menus, focus and layout and each paid for a round trip it did not
need. The protocol's harder corners stay in the integration suite, which
is supposed to exercise a real server.

**`waitForSync` is unchanged**, and no call site was edited. The outbox
still queues and drains through real HTTP; the fake gateway simply answers
in ~1ms instead of contending for one Radicale.

**Docker is only needed for the real project.** `global-setup.ts` starts
the container only when `desktop-real` is among the selected projects.

### Seeding, and staging an error state

*(added 2026-08-14, issue #54.)*

In fake mode the app server exposes `POST /api/testing/fake`, registered
**only** under `CALDAV_FAKE` — which `loadConfig` refuses to combine with
`NODE_ENV=production`, and which `index.ts` reaches through a dynamic
import so a production build never loads it. It takes credentials in the
body rather than a session cookie, because seeding has to happen before
the browser signs in and lists are per-account.

Three helpers in `e2e/tests/helpers.ts` wrap it:

- **`seedLists`** — put an account into a known state before `login`.
  Prefer it wherever a spec's setup is not its subject: arranging todos
  through modals costs a round trip and a `waitForSync` each.
- **`stageFault`** — fail the next N calls to named gateway operations
  with a given status, or answer them slowly. `status: 0` means "could not
  reach the CalDAV server at all", which the BFF maps to the 502 the
  client reads as "keep the queue".
- **`clearFaults`** — end an outage on demand, so recovery can be asserted
  without tuning a fault count against the outbox's retry schedule.

**A staged fault must change the test's outcome.** Both specs in
`upstream-errors.spec.ts` were written, run with the fault removed, seen
to *pass*, and then rewritten until they failed — a successful LWW rebase
looks identical to a write that never conflicted, so asserting the end
state alone proved nothing. This is the e2e form of the rule already in
CLAUDE.md about verifying a test fails without its fix.

**`page.route` is still correct for some specs**, and two keep it:
`recovery.spec.ts` needs an outage with a precise start and end in
wall-clock time (the gateway's faults are counted, not timed), and
`offline.spec.ts` is about the *browser's* connectivity, which
`context.setOffline` is the only way to produce.

### What the fake does not cover

*(added 2026-08-14, issue #54.)*

A fake is only as useful as its honesty about where it diverges. These are
known and deliberate; anything in this list is covered by the integration
suite, a unit test, or nothing at all — and "nothing at all" is recorded
rather than hidden.

- **Everything tsdav does.** iCalendar serialisation, PROPFIND/REPORT
  parsing, foreign property preservation, malformed calendar objects. This
  is the integration suite's job (`apps/server/test/integration/`), and the
  reason `real-caldav.spec.ts` exists at all.
- **Credential rejection.** The fake's `login()` accepts anything, so no
  mocked spec exercises a failed sign-in or the attempt limiter. Stage one
  deliberately with `stageFault({ operations: ['login'], status: 401 })`.
- **A duplicate list id.** The fake answers 409; a real Radicale's
  MKCALENDAR failure goes through `translate()` and surfaces as 502. No
  spec creates one, but do not treat the mocked status as the real one.
- **A lenient ctag.** The fake bumps a collection's ctag on every write,
  which is stricter than the RFC requires and stricter than some servers.
  That keeps the short-circuit genuinely exercised rather than accidentally
  always-true, but it means the "server did not change the ctag after a
  write" bug class is unreachable here.

## One CalDAV account per test

*(added 2026-08-05.)*

`login()` signs in as a user derived from the running test's title, so
**every spec starts from an empty nav**. The container runs with
`[auth] type = none`, so this costs nothing — no account setup, no
cleanup, and storage dies with the container.

*(changed 2026-08-14, issue #54: this holds in fake mode too. The fake
keys its state on server URL plus username, so a per-test username is a
per-test account there as well; `login` resets that account first, unless
the spec already called `seedLists`, which resets and populates in one
request.)*

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
