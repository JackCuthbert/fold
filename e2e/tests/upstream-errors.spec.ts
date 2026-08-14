import { expect, test, type Page } from '@playwright/test'
import {
  addTodo,
  clearFaults,
  login,
  reloadFromServer,
  seedLists,
  stageFault,
  waitForSync,
} from './helpers'

/**
 * Open a seeded list.
 *
 * The app opens on Today, and these todos carry no due date, so the list
 * has to be selected before its rows are on screen. `.first()` because at
 * a desktop viewport the drawer and the pinned sidebar both render the
 * nav.
 */
const openList = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'Lists' })
    .getByRole('button', { name, exact: true })
    .first()
    .click()

// docs/specs/api.md — error mapping; docs/specs/testing.md — staging an
// error state. *(added 2026-08-14, issue #54.)*
//
// **What only the gateway seam can test.**
//
// These stage the failure at the BFF's *outbound* edge — the CalDAV server
// misbehaving — and then assert on what the user ends up seeing. The whole
// path in between is real: the gateway throws a typed error, the router
// maps it to an HTTP status (api/router.ts — `toResponse`), the client
// classifies that status and decides whether to keep the mutation queued.
//
// `page.route` cannot express this. Intercepting `/api/**` at the browser
// means *inventing* the status the BFF would have returned and asserting
// the client handles the invention — which proves the client works against
// a fixture, and proves nothing about whether the BFF actually produces
// that status for that upstream failure. Here the mapping is exercised
// rather than assumed, which is the concrete reason this suite mocks the
// gateway rather than the API (see the comparison in issue #54, and
// docs/architecture/e2e-fake-caldav-gateway.md).

test('an upstream outage keeps the write queued, then it drains', async ({
  page,
}) => {
  await seedLists(page, [{ displayName: 'Errands', todos: [] }])
  await login(page)
  await openList(page, 'Errands')

  // The CalDAV server is unreachable for a long run of writes. Status 0 is
  // the fake's "could not reach it at all", which the gateway raises as
  // `CaldavUnreachableError` and the router maps to 502 — the status the
  // client reads as "keep the queue" rather than "give up"
  // (docs/specs/sync-and-offline.md).
  //
  // Effectively unlimited, and ended explicitly by `clearFaults` below.
  //
  // A tuned count would be wrong the moment the outbox's retry schedule
  // changed — and wrong *silently*, because too few failures let the
  // retries absorb the outage before it ever reaches the UI, leaving this
  // test passing while asserting nothing (the trap this spec file's own
  // history and `recovery.spec.ts` both record). A number nothing can
  // out-run removes the coupling instead of re-tuning it.
  await stageFault(page, {
    operations: ['createTodo'],
    status: 0,
    count: 100_000,
  })

  await addTodo(page, 'Post the letters')

  // The app stays usable while the server is down: the todo is on screen
  // optimistically, and the status says the write is still outstanding
  // rather than pretending it succeeded. That is the offline-first
  // promise, and it is what only a real outage produces.
  await expect(page.getByText('Post the letters')).toBeVisible()
  await expect(page.getByText(/Syncing \d+ change/).first()).toBeVisible()

  // Now let it through. The queue drains by itself, with no intervention
  // from the test — which is what distinguishes "queued" from "lost".
  await clearFaults(page)
  await waitForSync(page)
  await expect(page.getByText('Post the letters')).toBeVisible()

  // And it is genuinely on the "server" — via `reloadFromServer`, which
  // drops the persisted query cache first, so this cannot be answered by
  // the optimistic copy still sitting in IndexedDB (issue #8,
  // docs/specs/testing.md — reloading in an e2e test).
  await reloadFromServer(page)
  await openList(page, 'Errands')
  await expect(page.getByText('Post the letters')).toBeVisible()
})

test('an unrebasable conflict is dropped rather than retried forever', async ({
  page,
}) => {
  await seedLists(page, [
    { displayName: 'Errands', todos: [{ summary: 'Return the parcel' }] },
  ])
  await login(page)
  await openList(page, 'Errands')
  await expect(page.getByText('Return the parcel')).toBeVisible()

  // 412 is what a CalDAV server answers when the ETag the client edited
  // has moved on — someone else changed the todo first. The BFF answers
  // with the *fresh* copy attached (api/todos/update.ts), and the client
  // rebases onto its etag and retries the same change: last-write-wins, by
  // design (docs/specs/sync-and-offline.md — conflict handling).
  //
  // Two conflicts, not one. The first is what the client rebases past —
  // and a single 412 is *invisible* in the end state, because a successful
  // rebase looks exactly like a write that never conflicted (verified: the
  // one-fault version of this test passed with the fault removed, which
  // means it was asserting nothing).
  //
  // Failing the rebased retry as well is what makes the path observable:
  // the client gives up, tags it a fatal conflict rather than retrying
  // forever, and the edit does *not* land. That outcome is reachable only
  // through the conflict branch, so this test now fails if that branch
  // breaks.
  //
  // Note the fault names `updateTodo` only. Faults are keyed on the
  // *gateway method*, not the API request, and the 412 path calls
  // `fetchTodo` as well to attach the fresh copy (api/todos/update.ts) —
  // which stays healthy, and must, or there would be no fresh etag for
  // the client to rebase onto and the two attempts below could not
  // happen.
  await stageFault(page, {
    operations: ['updateTodo'],
    status: 412,
    count: 2,
  })

  await page.getByText('Return the parcel').click()
  await page
    .getByRole('textbox', { name: 'Summary' })
    .fill('Return the parcel to the depot')
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  // The queue drains rather than stalling: an unrebasable conflict is a
  // permanent answer and is dropped, not retried forever. If it were
  // treated as retryable the pill would never clear and this would time
  // out — which is the regression this guards.
  await waitForSync(page)

  // The edit did not survive, because the conflict could not be rebased
  // past. The server's copy is what remains — re-read after dropping the
  // persisted cache, so the optimistic copy cannot be answering.
  await reloadFromServer(page)
  await openList(page, 'Errands')
  await expect(page.getByText('Return the parcel')).toBeVisible()
  await expect(page.getByText('Return the parcel to the depot')).toBeHidden()
})
