import type { FullConfig } from '@playwright/test'
import {
  startRadicaleContainer,
  stopRadicaleContainer,
} from './helpers/radicale-container'

/**
 * Starts the throwaway e2e Radicale container exactly once — and only when
 * a project that needs it is actually running.
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
 *
 * **Conditional since 2026-08-14 (issue #54).** Only `desktop-real` talks
 * to Radicale now; the other projects run against the BFF's in-memory fake
 * gateway (docs/specs/testing.md — the two e2e modes). So a run that
 * selects only mocked projects — `--project desktop`, or `bun run
 * screenshot` — needs no container, and starting one anyway would make
 * Docker a prerequisite for tests that have nothing to do with CalDAV.
 * `config.projects` holds exactly the projects the run selected, so this
 * asks it rather than guessing from argv.
 */
export default async function globalSetup(
  config: FullConfig,
): Promise<(() => void) | void> {
  const needsRadicale = config.projects.some(
    (project) => project.name === 'desktop-real',
  )
  if (!needsRadicale) return
  const { url, containerId } = await startRadicaleContainer()
  process.env['E2E_CALDAV_URL'] = url
  return () => stopRadicaleContainer(containerId)
}
