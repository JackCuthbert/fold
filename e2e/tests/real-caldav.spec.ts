import { expect, test } from '@playwright/test'
import { dueDateInput, dueDateSwitch, setDueDate } from '../helpers/due'
import {
  addTodo,
  createList,
  dateFieldValue,
  login,
  openListMenu,
  reloadFromServer,
  renameList,
  uniqueName,
  waitForSync,
} from './helpers'

// docs/specs/testing.md — the two e2e modes. *(added 2026-08-14, issue #54.)*
//
// **The one spec that keeps a real CalDAV server behind the BFF.**
//
// Everything else in this suite runs against an in-memory fake gateway,
// which covers the client and every layer of the BFF but stops short of
// tsdav's actual conversation with a CalDAV server. This spec is what
// covers that last hop: real MKCALENDAR, real PROPPATCH, real PUT with an
// If-Match precondition, real REPORT, real ETags and ctags, real
// iCalendar serialisation through `packages/vtodo`.
//
// It is deliberately **one** test rather than eleven. The other ten that
// used to live in `happy-path.spec.ts` were about UI behaviour — modals,
// menus, focus, layout — and each paid for a real CalDAV round-trip it did
// not need. They moved to the fake; this one journey stayed, because a
// single end-to-end pass is exactly what the CalDAV integration guarantee
// needs, and doing it once is what keeps the real server off the critical
// path of the other 40-odd tests.
//
// The complementary guarantee — that the gateway handles the protocol's
// awkward corners (foreign property preservation, 412 paths, malformed
// objects) — is the integration suite's job and stays there
// (apps/server/test/integration/), against its own Radicale, in its own CI
// job.

test('a todo survives the whole journey against a real CalDAV server', async ({
  page,
}) => {
  await login(page)

  // Create a list — MKCALENDAR against Radicale.
  const listName = uniqueName('journey')
  await createList(page, listName)
  await expect(page.getByRole('heading', { name: listName })).toBeVisible()
  // An empty list says so in words (docs/specs/ui.md — the header). A
  // moment of skeleton comes first, since the list is genuinely new.
  await expect(page.getByText('No todos')).toBeVisible({ timeout: 10_000 })

  // Create a todo — a real PUT of a VTODO, serialised by packages/vtodo.
  await addTodo(page, 'Collect the keys')
  await expect(page.getByText('Collect the keys')).toBeVisible()
  await waitForSync(page)

  // Edit it, including a due date — a read-modify-write round trip that
  // has to preserve everything it does not understand
  // (docs/specs/caldav-compliance.md).
  await page.getByText('Collect the keys').click()
  await page
    .getByRole('textbox', { name: 'Summary' })
    .fill('Collect the keys from the agent')
  await setDueDate(page, dateFieldValue())
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await waitForSync(page)

  // The edit is really on the server, not just in IndexedDB — hence
  // `reloadFromServer`, which drops the persisted query cache first
  // (docs/specs/testing.md — reloading in an e2e test).
  await reloadFromServer(page)
  await expect(page.getByText('Collect the keys from the agent')).toBeVisible()
  await page.getByText('Collect the keys from the agent').click()
  await expect(dueDateSwitch(page)).toHaveAttribute('aria-checked', 'true')
  await expect(dueDateInput(page)).toHaveValue(dateFieldValue())
  await page.getByRole('button', { name: 'Close', exact: true }).first().click()

  // Move it to another list — a create in the destination plus a delete
  // in the source, both against the real server (docs/specs/todos.md).
  //
  // Moved while *active*, deliberately: a move rebuilds the todo from a
  // `NewTodo` payload (todos/hooks/use-todo-actions.ts), which carries no
  // completion, so a moved todo arrives open by design. Completing after
  // the move rather than before keeps this a journey rather than an
  // assertion about that detail, which is the move dialog's business and
  // is covered in the mocked suite.
  const destination = uniqueName('destination')
  await createList(page, destination)
  await waitForSync(page)
  await page
    .getByRole('navigation', { name: 'Lists' })
    .getByRole('button', { name: listName, exact: true })
    .first()
    .click()
  await page.getByText('Collect the keys from the agent').click()
  await page.getByRole('button', { name: 'Move to another list' }).click()
  const moveDialog = page.getByRole('dialog').filter({ hasText: 'Move to…' })
  await moveDialog.getByRole('button', { name: destination }).click()
  await waitForSync(page)

  // It landed there, after a real round trip.
  await page
    .getByRole('navigation', { name: 'Lists' })
    .getByRole('button', { name: destination, exact: true })
    .first()
    .click()
  await expect(page.getByText('Collect the keys from the agent')).toBeVisible()

  // Complete it — STATUS/COMPLETED written through the same PUT path.
  await page
    .getByRole('checkbox', {
      name: 'Mark "Collect the keys from the agent" done',
    })
    .click()
  await expect(
    page.getByRole('button', { name: 'Completed (1)' }),
  ).toBeVisible()
  await waitForSync(page)

  // Rename a list — PROPPATCH of displayname.
  const renamed = uniqueName('renamed')
  await renameList(page, destination, renamed)
  await expect(page.getByRole('heading', { name: renamed })).toBeVisible()
  await waitForSync(page)

  // Delete the todo — a real DELETE carrying its ETag.
  await page.getByRole('button', { name: 'Completed (1)' }).click()
  await page.getByText('Collect the keys from the agent').click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('button', { name: 'Delete todo' }).click()
  await expect(page.getByText('Collect the keys from the agent')).toBeHidden()

  // And it stays deleted across a reload that really asks the server.
  // The absence assertion is the one that most needs the persisted cache
  // dropped: a restored pre-delete snapshot would show it (issue #8).
  await reloadFromServer(page)
  await expect(page.getByText('Collect the keys from the agent')).toBeHidden()

  // Finally the list itself — a real collection DELETE.
  await openListMenu(page, renamed)
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await page.getByRole('button', { name: 'Delete list' }).click()
  await expect(
    page.getByRole('button', { name: renamed, exact: true }),
  ).toBeHidden()
})
