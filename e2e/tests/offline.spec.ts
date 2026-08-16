// docs/specs/sync-and-offline.md — the outbox queues writes while the
// browser is offline and replays them on reconnect.
//
// **Keeps `context.setOffline`, deliberately** *(reviewed 2026-08-14,
// issue #54.)*
//
// The subject here is the *browser's* connectivity, not the CalDAV
// server's: what is being tested is that the client keeps working with no
// network at all, queues its writes durably, and drains them when the
// network returns. A gateway fault would be the wrong reproduction — it
// would leave the browser online and the BFF reachable, which is the
// "server unreachable" path (`recovery.spec.ts`) rather than the offline
// one. `context.setOffline` is the only mechanism that produces the real
// thing, and it is orthogonal to which gateway sits behind the BFF.
//
// It does benefit from the move regardless: the pre-outage sync and the
// post-reconnect drain now settle against an in-memory gateway rather
// than a contended Radicale.
import { expect, test } from '@playwright/test'
import {
  addTodo,
  createList,
  login,
  uniqueName,
  waitForPersistedCompleted,
  waitForSync,
} from './helpers'

test('offline actions queue and replay on reconnect', async ({
  page,
  context,
}) => {
  await login(page)
  const listName = uniqueName('offline')
  await createList(page, listName)
  await addTodo(page, 'Synced before outage')
  await expect(page.getByText('Synced before outage')).toBeVisible()
  // Let the create round-trip before going offline — matches what a real
  // user experiences and avoids racing the outbox's own retry of an
  // in-flight request against the offline toggle.
  await waitForSync(page)

  await context.setOffline(true)

  await addTodo(page, 'Written while offline')
  await page
    .getByRole('checkbox', { name: 'Mark "Synced before outage" done' })
    .click()
  await expect(page.getByText('Written while offline')).toBeVisible()
  // Exact match: the nav footer's status label is also literal text
  // "Offline" now (docs/specs/ui.md — status display), so a loose /Offline/
  // substring would match both it and this pill and violate Playwright's
  // strict mode. The pill alone carries the full "· N queued" detail.
  const pill = page.getByText(/^Offline · \d+ queued$/)
  await expect(pill).toBeVisible()

  await context.setOffline(false)
  await expect(pill).toBeHidden({ timeout: 15_000 })
  await waitForSync(page)

  // waitForSync only proves the completion reached the *server* — the
  // browser's own query-cache persister write-behinds to IndexedDB on a
  // separate throttle (see waitForPersistedCompleted). Reloading inside
  // that window would restore the pre-completion snapshot and — correctly
  // for offline-first caching, per docs/specs/sync-and-offline.md — not
  // refetch for up to staleTime (30s), well past this test's patience.
  await waitForPersistedCompleted(page, 'Synced before outage', true)

  // Reload proves the changes reached the server, not just the cache.
  await page.reload()
  await expect(page.getByText('Written while offline')).toBeVisible()
  await page.getByRole('button', { name: 'Completed (1)' }).click()
  await expect(page.getByText('Synced before outage')).toBeVisible()
})
