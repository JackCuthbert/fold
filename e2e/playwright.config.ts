import { defineConfig, devices } from '@playwright/test'

// E2E tests — docs/specs/testing.md.
//
// **Two modes, two app servers** *(added 2026-08-14, issue #54.)*
//
// Most specs are about the client and the BFF: row states, menus, filters,
// derived views, layout at a breakpoint. None of them care whether a real
// CalDAV server is behind the BFF, but every one of them used to wait on
// one — 56 `waitForSync` calls across 10 spec files, each a real round
// trip to a single shared Radicale under `cores / 2` workers. That
// contention, not the app, is what produced the intermittent 30s timeouts.
//
// So the suite now runs against **two** app servers on two ports:
//
// - **:3300, real CalDAV.** One spec (`real-caldav.spec.ts`), the
//   `desktop-real` project. It proves the CalDAV round-trip genuinely
//   works: create, edit, complete, move, delete, reload, persist.
// - **:3301, a fake gateway.** Everything else. `CALDAV_FAKE=1` swaps the
//   BFF's outbound CalDAV calls for an in-memory implementation of the
//   same `CaldavGateway` interface (apps/server/src/caldav/fake-gateway.ts).
//
// The boundary is the BFF's *outbound* edge, not the browser's. Mocking
// `/api/**` with `page.route` would have been less work, but Playwright
// only sees requests the browser makes — the CalDAV traffic is Bun-side
// `fetch` inside tsdav — so that would take the whole server out of the
// test: router, session sealing, handlers, error mapping. The fake keeps
// every layer this repo wrote and replaces only tsdav.
// See docs/architecture/e2e-fake-caldav-gateway.md.
//
// The Radicale container is still started once by `global-setup.ts`, but
// only when a project that needs it is actually running — see there.
const FAKE_BASE_URL = 'http://127.0.0.1:3301'
const REAL_BASE_URL = 'http://127.0.0.1:3300'

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  use: { trace: 'retain-on-failure' },
  globalSetup: './global-setup',
  projects: [
    // The mocked default: every spec except the real-CalDAV one and the
    // mobile/screenshot specs, which have projects of their own.
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], baseURL: FAKE_BASE_URL },
      testIgnore: [/mobile/, /screenshot/, /real-caldav/],
    },
    // The one spec that keeps a real Radicale behind the BFF. Its own
    // project because it needs the other app server, on the other port.
    {
      name: 'desktop-real',
      use: { ...devices['Desktop Chrome'], baseURL: REAL_BASE_URL },
      testMatch: /real-caldav/,
    },
    // A generator, not a test: it writes docs/screenshot.png, which the
    // repo tracks. Its own project so `bun run screenshot` can select it —
    // and so `test`, which names the projects it wants, never rewrites a
    // committed image as a side effect of running the suite.
    //
    // Runs against the fake: the image is of the *client*, and seeded
    // state renders identically whichever gateway produced it — while
    // being far more predictable to arrange.
    {
      name: 'screenshot',
      use: { ...devices['Desktop Chrome'], baseURL: FAKE_BASE_URL },
      testMatch: /screenshot/,
    },
    // Same client, same API, so it follows the desktop project onto the
    // fake (the issue asked the question explicitly; the answer is yes).
    {
      name: 'mobile',
      // Pixel 7 keeps us chromium-only in CI.
      use: { ...devices['Pixel 7'], baseURL: FAKE_BASE_URL },
      testMatch: /mobile/,
    },
  ],
  webServer: [
    {
      command: 'bun ../apps/server/src/index.ts',
      url: REAL_BASE_URL,
      reuseExistingServer: false,
      env: {
        PORT: '3300',
        SESSION_SECRET: 'e2e-secret-16-chars-min',
      },
    },
    {
      command: 'bun ../apps/server/src/index.ts',
      url: FAKE_BASE_URL,
      reuseExistingServer: false,
      env: {
        PORT: '3301',
        SESSION_SECRET: 'e2e-secret-16-chars-min',
        // The whole point of this second server. Refused outright under
        // NODE_ENV=production, and refused anywhere without the second
        // opt-in below, so `CALDAV_FAKE=1` alone can never hollow out a
        // deployment by accident (apps/server/src/config.ts).
        CALDAV_FAKE: '1',
        CALDAV_FAKE_CONFIRM: 'i-am-running-the-e2e-suite',
      },
    },
  ],
})
