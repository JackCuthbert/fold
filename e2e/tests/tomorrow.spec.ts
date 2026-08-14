import { expect, test, type Page } from '@playwright/test'
import { setDueDate } from '../helpers/due'
import {
  addTodo,
  createList,
  dateFieldValue,
  login,
  uniqueName,
  waitForSync,
} from './helpers'

/**
 * A view's own row in the nav.
 *
 * Scoped and `.first()` for the same reason the other specs do it: on
 * desktop the drawer and the pinned sidebar both exist in the DOM, so a
 * plain name matches twice.
 */
const navRow = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'Lists' })
    .getByRole('button', { name, exact: true })
    .first()

/** Give an existing todo a due date through the ordinary edit path. */
async function setDue(page: Page, summary: string, day: number): Promise<void> {
  await page.getByText(summary, { exact: true }).click()
  await setDueDate(page, dateFieldValue(day))
  await page.getByRole('button', { name: 'Save', exact: true }).click()
}

// docs/specs/tomorrow-view.md
//
// End to end rather than only in unit tests because `selectTomorrow` being
// right proves nothing about whether the view is reachable, titled, or
// wired to the pane — four separate paths, as with the list kinds.

test('Tomorrow shows the day ahead and leaves overdue work in Today', async ({
  page,
}) => {
  await login(page)

  const list = uniqueName('planning')
  await createList(page, list)
  await navRow(page, list).click()

  // Deliberately free of date words. These go through quick add, which
  // parses a summary for dates — "Tomorrow thing" was read as a due date
  // plus "thing", so the row never carried the name the assertions look
  // for (docs/specs/quick-add.md — testing).
  // *(renamed 2026-08-14, found in review.)*
  for (const item of ['Late thing', 'Current thing', 'Next thing']) {
    await addTodo(page, item)
  }
  await waitForSync(page)

  await setDue(page, 'Late thing', -3)
  await setDue(page, 'Current thing', 0)
  await setDue(page, 'Next thing', 1)
  await waitForSync(page)

  // Today keeps overdue work — that is its rule, and the reason Tomorrow
  // needs one of its own (docs/specs/today-view.md).
  await navRow(page, 'Today').click()
  await expect(page.getByText('Late thing', { exact: true })).toBeVisible()
  await expect(page.getByText('Current thing', { exact: true })).toBeVisible()
  await expect(page.getByText('Next thing', { exact: true })).toBeHidden()

  // Tomorrow is the day ahead and nothing else. The overdue assertion is
  // the point of this test: an open lower bound here would make the two
  // views near-copies of each other.
  await navRow(page, 'Tomorrow').click()
  await expect(page.getByText('Next thing', { exact: true })).toBeVisible()
  await expect(page.getByText('Late thing', { exact: true })).toBeHidden()
  await expect(page.getByText('Current thing', { exact: true })).toBeHidden()

  // It is a view, not a list: nothing to add to it.
  await expect(page.getByRole('button', { name: 'Add a todo' })).toBeHidden()
})

test('work ticked off early moves to the day it was done', async ({ page }) => {
  await login(page)

  const list = uniqueName('ahead')
  await createList(page, list)
  await navRow(page, list).click()

  // Nothing due yet. The count line carries that on its own — there is no
  // empty-state copy in a derived view (docs/specs/tomorrow-view.md).
  await navRow(page, 'Tomorrow').click()
  await expect(page.getByText('No todos')).toBeVisible()

  await navRow(page, list).click()
  await addTodo(page, 'Pack the bag')
  await waitForSync(page)
  await setDue(page, 'Pack the bag', 1)
  await waitForSync(page)

  await navRow(page, 'Tomorrow').click()
  await expect(page.getByText('Pack the bag', { exact: true })).toBeVisible()

  // A completed todo belongs to the day it was completed, not the day it
  // was due (docs/specs/tomorrow-view.md). So ticking tomorrow's work off
  // early takes it out of Tomorrow — there is nothing left to do
  // tomorrow — and puts it in Today, under Completed.
  await page
    .getByRole('checkbox', { name: /Pack the bag/ })
    .first()
    .click()
  await waitForSync(page)
  await expect(page.getByText('Pack the bag', { exact: true })).toBeHidden()
  await expect(page.getByText('No todos')).toBeVisible()

  await navRow(page, 'Today').click()
  await expect(page.getByText('Pack the bag', { exact: true })).toBeVisible()
})
