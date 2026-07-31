import {
  startRadicaleContainer,
  stopRadicaleContainer,
} from './helpers/radicale-container'

/**
 * Starts the throwaway e2e Radicale container exactly once.
 *
 * Playwright loads `playwright.config.ts` in the root process *and* in
 * every worker process it spawns (each with a different pid) — top-level
 * await in the config itself would start one container per worker, most
 * of them orphaned. `globalSetup`, by contrast, is documented to run once
 * in the root process before any worker exists, which is exactly the
 * "start once" semantics a throwaway per-run container needs.
 *
 * The resolved URL is stashed in `process.env['E2E_CALDAV_URL']` — worker
 * processes Playwright spawns after this hook returns inherit it, the
 * same way any Node child process inherits its parent's env at spawn
 * time — and `tests/helpers.ts` reads it back to build `CALDAV_URL`.
 *
 * Playwright always calls a function returned from global setup as
 * teardown, whether the run passed or failed, so the container (captured
 * in this closure — no env round-trip needed for teardown) is guaranteed
 * to be removed either way.
 */
export default async function globalSetup(): Promise<() => void> {
  const { url, containerId } = await startRadicaleContainer()
  process.env['E2E_CALDAV_URL'] = url
  return () => stopRadicaleContainer(containerId)
}
