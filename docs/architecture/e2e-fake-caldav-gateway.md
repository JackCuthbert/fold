# Decision: Mock the CalDAV gateway, not the JSON API

Implements [specs/testing](../specs/testing.md). Issue #54.

The e2e suite used to run every spec against one shared throwaway Radicale
container, with `cores / 2` workers and no retries. **56 `waitForSync`
calls across 10 of 12 spec files** were each a real CalDAV round trip, so
most of what the suite waited on was Radicale's throughput under
contention rather than the app's behaviour. Different tests failed each
run, always on a 30s timeout, always passing in isolation.

The suite now runs in **two modes**: one spec keeps a real Radicale, and
everything else runs against an in-memory `CaldavGateway` selected by the
`CALDAV_FAKE` env var (`apps/server/src/caldav/fake-gateway.ts`).

## Which boundary

Two seams could have been cut, and they are not equivalent:

| | intercepts | covers | reaches |
|---|---|---|---|
| `page.route` on `/api/**` | browser → BFF | the client only | client code, no server |
| a fake `CaldavGateway` | BFF → CalDAV | client **and** BFF | everything but tsdav |

`page.route` only sees requests the *browser* makes. The CalDAV traffic is
Bun-side `fetch` inside tsdav, so intercepting `/api/**` removes the entire
BFF from the test — router, session sealing, handlers, response schema
validation, error mapping. Those are code this repo wrote and would
otherwise be covered by nothing at this layer.

The gateway seam was already there and already used: `CaldavGateway`
(`apps/server/src/caldav/gateway.ts`) is injected as `makeGateway`, and the
handler unit tests have run against a fake through it since they were
written. Pointing the e2e app server at an in-memory implementation removes
Radicale from the loop while keeping every layer above it real — a strictly
better test for the same determinism win.

**The concrete difference is visible in `e2e/tests/upstream-errors.spec.ts`.**
Those specs stage a failure at the BFF's outbound edge and assert what the
user ends up seeing, which exercises the gateway raising a typed error, the
router mapping it to a status, and the client classifying that status.
Staged at the browser instead, the test would have to *invent* the status
the BFF would have returned — proving the client handles the invention, and
nothing about whether the BFF produces it.

`page.route` is still the right tool where a spec wants a specific HTTP
status at the client, and `recovery.spec.ts` keeps it deliberately: that
test needs an outage with a precise start and end in wall-clock time, which
the gateway's counted faults cannot express.

## What each mode covers

- **Real (`desktop-real`, port 3300).** `real-caldav.spec.ts`, one journey:
  create, edit, complete, move, delete, reload, persist. Real MKCALENDAR,
  PROPPATCH, PUT with preconditions, REPORT, ETags and ctags, and real
  iCalendar serialisation through `packages/vtodo`.
- **Fake (`desktop`, `mobile`, `screenshot`, port 3301).** Everything else.
  The client and the whole BFF are real; only tsdav's conversation with a
  CalDAV server is replaced.

The protocol's awkward corners — foreign property preservation, 412 paths,
malformed objects — stay with the integration suite
(`apps/server/test/integration/`), which is *supposed* to exercise a real
server and runs in its own CI job.

## Why it cannot reach production

`loadConfig` (`apps/server/src/config.ts`) **throws** when `CALDAV_FAKE`
is set and either:

- `NODE_ENV=production` — which the published image sets (`Dockerfile`); or
- `CALDAV_FAKE_CONFIRM` is not exactly `i-am-running-the-e2e-suite`.

The second condition is the one doing the real work. `NODE_ENV` defaults
to `development` and this spec elsewhere describes self-hosters who never
set it, so a production-only check would leave precisely those deployments
unguarded. Requiring a second, deliberately unwieldy value means a bare
`CALDAV_FAKE=1` — the plausible typo, the compose line copied out of a
test — fails closed everywhere.

Refusing to boot is the right outcome rather than degrading: unlike
`ALLOW_INSECURE_COOKIE`, which weakens a deployment, this flag would
hollow it out — memory-only storage plus an unauthenticated seeding route.

`index.ts` additionally reaches the fake through a **dynamic** `import()`,
so a production build never loads either module. That is a build-weight
and blast-radius measure rather than a second security guard: it keys off
the same `config.CALDAV_FAKE` boolean, so it is not independent of the
check above, and it should not be counted as though it were.

Both the refusal and the route's absence are verified against the built
image, not inferred: `docker run … -e CALDAV_FAKE=1` on the production
image exits with the config error, and a normally-started container
answers `POST /api/testing/fake` with 404.

The guard itself is pinned by unit tests (`apps/server/test/config.test.ts`),
so a refactor that drops it fails CI rather than passing quietly.

## Consequences

- `waitForSync` needed no change and no call site was edited. The outbox
  still queues and drains through real HTTP; the gateway just answers in
  ~1ms. Had the suite mocked `/api/**`, there would be no drain to wait for
  and the helper would have had to become a fiction.
- Seeding replaced click-by-click arrangement where a spec's setup was not
  its subject (`seedLists` in `e2e/tests/helpers.ts`).
- Docker is no longer needed to run most of the suite — only the
  `desktop-real` project starts the container, and `global-setup.ts` skips
  it otherwise.
