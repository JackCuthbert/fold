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
//
// **Keeps `page.route`, deliberately** *(reviewed 2026-08-14, issue #54.)*
//
// This spec now runs against the fake gateway like the rest of the suite,
// and the fake can stage an outage of its own (`stageFault` in
// tests/helpers.ts). It is not the right tool here. What this test needs
// is an outage with a precise *start and end in wall-clock time* — the
// window between them is the entire design of the test, tuned against
// query-core's retry ladder (see OUTAGE_MS). The gateway's faults are
// counted, not timed: staging "fail for 5 seconds" through them would mean
// guessing how many reads land in that window, which is the machine-speed
// dependency this test was rewritten to remove.
//
// The issue anticipated this: `page.route` stays for specs staging a
// specific HTTP response at the client. This is that case, and the
// interception is against the *fake* app server now, so it no longer
// competes with a shared Radicale for timing.

/**
 * How long the fake outage lasts.
 *
 * **Longer than the old `retry: 1` could survive, shorter than the current
 * ladder.** That window is the whole design of this test, and getting it
 * wrong is what made the first version fail on CI.
 *
 * The attempts land at roughly 0.4s, 1.4s, 3.4s, 7.4s and 15.4s
 * (query-core's `defaultRetryDelay` — 1/2/4/8/16s of backoff). At 5s the
 * outage is past the second attempt, so `retry: 1` is spent and the old
 * code has nothing left but the 45s poll; but attempts 3, 4 and 5 are
 * still to come, so the current code recovers through its own ladder.
 *
 * The first version used 12s, chosen to outlast the *whole* ladder so the
 * query genuinely reached `error`. That is a truer reproduction of the
 * captured failure, but it made recovery depend on the 45s poll — and
 * therefore on where the outage's end happened to fall between attempts,
 * which moves with machine speed. It passed locally in ~17s and timed out
 * on CI's slower single-core runner. A test whose result depends on that
 * alignment is measuring the machine, not the fix.
 * *(changed 2026-08-06 after CI 31086197736.)*
 */
const OUTAGE_MS = 5_000

/**
 * How long recovery may take once the server is healthy again.
 *
 * Deliberately tight enough to *fail* on the old behaviour rather than
 * merely pass on the new one. With the ladder, the next attempt after a
 * 5s outage is the one at ~7.4s, so recovery lands within a couple of
 * seconds of the server returning. With `retry: 1` there is no next
 * attempt at all — the earliest recovery is the 45s poll, and only if the
 * tab is focused.
 *
 * 25s sits well clear of the first and well short of the second, with
 * enough headroom for a slow runner. A budget past 45s would pass either
 * way, which is how a test ends up proving nothing.
 */
const RECOVERY_MS = 25_000

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

// One test, not two. A second covering a *warm* view — todos already
// cached, then a blip — was written first and then deleted: it asserted
// the same recovery through a weaker signal, and its setup could fail on
// its own. Under a loaded suite `waitForSync` returned before the create
// had really landed, so the todo it waited to see come back had never
// reached the server; the captured page showed a fully recovered client
// ("Synced", reads flowing) failing an assertion about a todo that did not
// exist. A test whose *arrangement* is the flaky part cannot speak to the
// behaviour it is named after, and duplicating coverage is what let it
// look harmless (CLAUDE.md — don't duplicate tests across layers).
// *(removed 2026-08-06.)*

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
