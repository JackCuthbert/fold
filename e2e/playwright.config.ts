import { defineConfig, devices } from '@playwright/test'

// E2E happy paths only — docs/specs/testing.md.
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:3300' },
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
      command:
        'radicale --auth-type none --server-hosts 127.0.0.1:5233 --storage-filesystem-folder .radicale-data',
      url: 'http://127.0.0.1:5233',
      reuseExistingServer: false,
    },
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
