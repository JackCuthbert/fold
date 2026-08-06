import { expect, test, type Page } from '@playwright/test'
import { addTodo, createList, login, uniqueName, waitForSync } from './helpers'

// docs/specs/sync-and-offline.md — status reflects current conditions,
// never latched history (issue #30).
//
// The intermittent this covers was only ever seen by accident: one todos
// read fails, the view is left showing a skeleton count and a red
// "Disconnected" dot, and it stays that way. Reproducing it by re-running
// the suite took dozens of runs and said nothing about the cause, so these
// fail the upstream deliberately instead — an outage with a start and an
// end — and assert the client comes back by itself.
//
// A product test wearing a test-infra hat: a user whose server blips sees
// exactly what CI saw.

/**
 * How long the fake outage lasts.
 *
 * Long enough to outlast the whole retry ladder (1+2+4+8s of backoff —
 * query-core's `defaultRetryDelay`), so the query genuinely lands in
 * `error` with nothing left to try. That is the state the failing run was
 * stuck in, and the only one worth asserting recovery from.
 */
const OUTAGE_MS = 12_000

/**
 * How long recovery may take once the server is healthy again.
 *
 * Chosen from measurement, and deliberately tight enough to *fail* on the
 * old behaviour rather than merely pass on the new one. With the retry
 * ladder in providers.tsx, a cold list recovers in ~15.8s (attempts at
 * 0.4s, 1.4s, 3.4s, 7.4s, 15.4s). With the previous `retry: 1` it took
 * ~46.9s — two attempts a second apart, then nothing until the 45s poll.
 *
 * 30s sits between the two: comfortable headroom over the real figure, and
 * still short enough that regressing the retry ladder turns this red
 * instead of merely slow. A budget of 70s would have passed either way,
 * which is how a test ends up proving nothing.
 */
const RECOVERY_MS = 30_000

/**
 * Fail every todos read with a 502 for `OUTAGE_MS`, then stop.
 *
 * Modelled on time rather than on a count of failed calls deliberately: a
 * count has to be tuned to whatever `retry` happens to be, so it silently
 * stops testing anything the moment that number changes — too few
 * failures and the retries absorb them all, and the outage never reaches
 * the UI to be recovered from.
 *
 * 502 with a real body, rather than an aborted connection, because that is
 * how the BFF reports an unreachable CalDAV server (api/router.ts — error
 * mapping). Anything >= 500 is what the client classifies as 'server', the
 * reason behind the "Disconnected" label (sync/process.ts —
 * classifyBlockReason); a dropped connection would say "Offline" instead
 * and exercise a different path.
 */
async function outage(page: Page): Promise<void> {
  const endsAt = Date.now() + OUTAGE_MS
  await page.route('**/api/lists/*/todos*', async (route) => {
    if (Date.now() >= endsAt) return route.fallback()
    await route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'caldav_unreachable',
        message: 'CalDAV server unreachable',
      }),
    })
  })
}

test('a list view recovers by itself after the server blips', async ({
  page,
}) => {
  test.setTimeout(OUTAGE_MS + RECOVERY_MS + 30_000)
  await login(page)

  const listName = uniqueName('blip')
  await createList(page, listName)
  await expect(page.getByRole('heading', { name: listName })).toBeVisible()
  await expect(page.getByText('No todos')).toBeVisible()
  await addTodo(page, 'Survives a blip')
  await waitForSync(page)

  // A reload during the outage: the app mounts, its todos read fails, and
  // the retries run out. That is the state the failing run was stuck in.
  await outage(page)
  await page.reload()

  // The todo comes back with no interaction at all. Its list read fails
  // for the whole outage, so this can only resolve once the reads recover
  // by themselves — which is the assertion. The page is never clicked,
  // focused or reloaded after the outage begins; recovery that needed any
  // of those is the bug (issue #30).
  await expect(page.getByText('Survives a blip')).toBeVisible({
    timeout: RECOVERY_MS,
  })
  await expect(page.getByText('Disconnected')).toBeHidden()
  await expect(page.getByText('Synced')).toBeVisible()

  // ...and the view is genuinely live again rather than showing a restored
  // snapshot: a new todo round-trips through the server it just lost.
  await addTodo(page, 'Added after recovery')
  await waitForSync(page)
  await expect(page.getByText('Added after recovery')).toBeVisible()
})

test('a cold list recovers by itself after the server blips', async ({
  page,
}) => {
  test.setTimeout(OUTAGE_MS + RECOVERY_MS + 30_000)
  await login(page)

  // The hard case, and the one the failing run actually hit: a list with
  // *no* cached todos to fall back on. `happy-path` created its list and
  // immediately read it, so there was nothing in IndexedDB to soften the
  // failure — the read was the only source of truth, and when it gave up
  // the count line stayed a skeleton for good.
  //
  // Reproduced here by starting the outage *before* the list exists, so
  // its first-ever read is the one that fails.
  const listName = uniqueName('blip-cold')
  await outage(page)
  await createList(page, listName)
  await expect(page.getByRole('heading', { name: listName })).toBeVisible()

  // With nothing cached and the reads failing, this genuinely degrades —
  // and it should, because the app really cannot answer. That is honest,
  // not a bug. The bug was that it never came back.
  //
  // The recovery assertion is the whole point: "No todos" is the settled
  // answer for an empty list, so seeing it proves a read completed *after*
  // the outage ended. The failing run sat on a skeleton here forever.
  await expect(page.getByText('No todos')).toBeVisible({ timeout: RECOVERY_MS })
  await expect(page.getByText('Disconnected')).toBeHidden()

  // The derived views fan out over every list at once (use-today-todos.ts)
  // rather than reading one, so they recover through a separate path —
  // worth its own assertion, since a stale skeleton there looks identical
  // to "you have nothing due".
  await addTodo(page, 'Due whenever')
  await waitForSync(page)
  await page.getByRole('button', { name: 'Today', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
  await expect(page.getByText('Synced')).toBeVisible()
})
