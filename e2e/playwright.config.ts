import { defineConfig, devices } from '@playwright/test'

// E2E happy paths only — docs/specs/testing.md.
//
// The CalDAV server is a throwaway Docker container, started once by
// `global-setup.ts` (see there and helpers/radicale-container.ts) rather
// than a `radicale` binary on PATH or a `webServer` entry here. Its host
// port is Docker-assigned rather than pinned, so two checkouts running
// `bun run test:e2e` at once never collide — the previous fixed port 5233
// is what caused that. The app server below doesn't need the CalDAV URL
// itself (only test code does, via `tests/helpers.ts`), so it stays a
// plain `webServer` entry.
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:3300', trace: 'retain-on-failure' },
  globalSetup: './global-setup',
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /mobile/,
    },
    {
      name: 'mobile',
      // Pixel 7 keeps us chromium-only in CI.
      use: { ...devices['Pixel 7'] },
      testMatch: /mobile/,
    },
  ],
  webServer: [
    {
      command: 'bun ../apps/server/src/index.ts',
      url: 'http://127.0.0.1:3300',
      reuseExistingServer: false,
      env: {
        PORT: '3300',
        SESSION_SECRET: 'e2e-secret-16-chars-min',
      },
    },
  ],
})
