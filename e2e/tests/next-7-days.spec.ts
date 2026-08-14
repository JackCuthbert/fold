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

/**
 * The day headings, scoped to the content column.
 *
 * `main` matters: the nav's own "Fold" title is an `<h2>` too, so an
 * unscoped `heading` query matches it first and reads as this view having a
 * day called Fold. Same reason the row query below is scoped — nav list
 * rows are `<li>`.
 */
const dayHeadings = (page: Page) =>
  page.locator('main').getByRole('heading', { level: 2 })

/** Give an existing todo a due date through the ordinary edit path. */
async function setDue(page: Page, summary: string, day: number): Promise<void> {
  await page.getByText(summary, { exact: true }).click()
  await setDueDate(page, dateFieldValue(day))
  await page.getByRole('button', { name: 'Save', exact: true }).click()
}

// docs/specs/next-7-days-view.md
//
// End to end rather than only in unit tests because `selectNextWeek` being
// right proves nothing about whether the view is reachable, titled, or
// wired to the pane — the same four separate paths the Tomorrow spec
// covers, and the reason that one exists alongside its own unit tests.
//
// Runs against the **fake CalDAV gateway** like every other behavioural
// spec (docs/specs/testing.md — two modes). It builds its fixture by
// driving the UI rather than through `seedLists`, because what it is
// asserting *is* that path: a todo given a due date through the ordinary
// edit form has to land in the right day's section. Seeding the end state
// would assert the view can render data, which the unit tests already
// cover, rather than that the app puts data there.
// *(noted 2026-08-14, after the suite moved to the fake in #56.)*
//
// **No timing in this spec.** Every assertion is about which rows a view
// contains after a sync that the helpers already wait on, so nothing here
// depends on how fast the machine is (CLAUDE.md — a timed e2e test must not
// depend on machine speed). The one thing that *could* have been
// time-sensitive — the far edge of the window — is pinned to day 6 and day
// 7 rather than to a duration.

test('Next 7 days spans the week including today, and nothing overdue', async ({
  page,
}) => {
  await login(page)

  const list = uniqueName('week')
  await createList(page, list)
  await navRow(page, list).click()

  for (const item of [
    'Overdue thing',
    'Today thing',
    'Tomorrow thing',
    'Midweek thing',
    'Last day thing',
    'Just outside thing',
  ]) {
    await addTodo(page, item)
  }
  await waitForSync(page)

  await setDue(page, 'Overdue thing', -3)
  await setDue(page, 'Today thing', 0)
  await setDue(page, 'Tomorrow thing', 1)
  await setDue(page, 'Midweek thing', 3)
  // Today counts as day one, so the window's last day is today+6 and
  // today+7 falls outside it.
  await setDue(page, 'Last day thing', 6)
  await setDue(page, 'Just outside thing', 7)
  await waitForSync(page)

  await navRow(page, 'Next 7 days').click()

  // The overlap, which is the decision this view turns on: today and
  // tomorrow are *in*, because a week that starts the day after tomorrow
  // is not a week (docs/specs/next-7-days-view.md — the window).
  await expect(page.getByText('Today thing', { exact: true })).toBeVisible()
  await expect(page.getByText('Tomorrow thing', { exact: true })).toBeVisible()
  await expect(page.getByText('Midweek thing', { exact: true })).toBeVisible()
  await expect(page.getByText('Last day thing', { exact: true })).toBeVisible()

  // Both bounds. Overdue stays in Today — the one rule this view does not
  // inherit from Today — and the seventh day out is past the window.
  await expect(page.getByText('Overdue thing', { exact: true })).toBeHidden()
  await expect(
    page.getByText('Just outside thing', { exact: true }),
  ).toBeHidden()

  // docs/specs/next-7-days-view.md — grouped by day, soonest first. The
  // ordering is the assertion that matters: copying Summary's comparator
  // would reverse the days and read as correct until you notice the dates
  // descend. Today and Tomorrow are named relatively, the rest absolutely.
  const headings = dayHeadings(page)
  await expect(headings.first()).toHaveText(/^Today/)
  await expect(headings.nth(1)).toHaveText(/^Tomorrow/)

  // Every day in the window is drawn, empty ones included — the shape of
  // the week is what this view is planned against
  // (docs/specs/next-7-days-view.md — every day is drawn). Seven headings
  // whatever is due, and the three days nothing is due on read "Clear".
  // *(changed 2026-08-14: was 4, when empty days were omitted.)*
  await expect(headings).toHaveCount(7)
  await expect(page.getByText('Clear', { exact: true })).toHaveCount(3)

  // The day heading carries a row count (docs/specs/list-kinds.md — the
  // count counts rows).
  await expect(headings.first()).toHaveText(/1$/)

  // It is a view, not a list: nothing to add to it.
  await expect(page.getByRole('button', { name: 'Add a todo' })).toBeHidden()

  // Today still keeps the overdue work it is responsible for, which is why
  // this view can decline it (docs/specs/today-view.md).
  await navRow(page, 'Today').click()
  await expect(page.getByText('Overdue thing', { exact: true })).toBeVisible()
})

// docs/specs/next-7-days-view.md — both groupings, nested. The two axes
// have to survive each other: health leads *within* its day rather than
// being lifted to the top of the view (which would file it under the wrong
// date) or collapsing into a flat run (which would bury it).
test('health leads within its own day, and only where there is health', async ({
  page,
}) => {
  await login(page)
  await createList(page, 'Health')
  const other = uniqueName('work')
  await createList(page, other)

  // Day 2 gets both a health todo and an ordinary one, so the pair of
  // subheadings appears. Day 3 gets an ordinary todo only.
  await navRow(page, 'Health').click()
  await addTodo(page, 'Take the tablets')
  await waitForSync(page)
  await setDue(page, 'Take the tablets', 2)

  await navRow(page, other).click()
  for (const item of ['Urgent work thing', 'Later work thing']) {
    await addTodo(page, item)
  }
  await waitForSync(page)
  await setDue(page, 'Urgent work thing', 2)
  await setDue(page, 'Later work thing', 3)
  await waitForSync(page)

  await navRow(page, 'Next 7 days').click()

  // Exactly one Health subheading and one Everything else, both belonging
  // to the day that has health work. Scoped to `main` — "Health" is also a
  // list name in the nav.
  const content = page.locator('main')
  await expect(content.getByRole('heading', { name: 'Health' })).toHaveCount(1)
  await expect(
    content.getByRole('heading', { name: 'Everything else' }),
  ).toHaveCount(1)

  // The health todo leads its day, above the ordinary one due the same
  // day — the whole point of nesting rather than flattening.
  const rows = page.locator('main').getByRole('listitem')
  await expect(rows.first()).toContainText('Take the tablets')

  // And the day *without* health work carries no subheadings at all — an
  // orphaned "Everything else" would label the only thing beneath it. The
  // single "Everything else" asserted above is what proves that, against
  // the two days this fixture puts work on.
  //
  // The day-heading count is the whole window rather than the populated
  // days: every day is drawn now, so seven headings is the constant and it
  // says nothing about the subheadings. Kept as a guard that the skeleton
  // is present in this fixture too.
  // *(changed 2026-08-14: was 2, when only populated days were drawn.)*
  await expect(dayHeadings(page)).toHaveCount(7)
})

test('work ticked off in the week ahead moves to the day it was done', async ({
  page,
}) => {
  await login(page)

  const list = uniqueName('weekahead')
  await createList(page, list)
  await navRow(page, list).click()

  // Nothing due yet. The count line carries that, and the week keeps its
  // shape: seven days, every one of them "Clear"
  // (docs/specs/next-7-days-view.md — empty). No extra empty-state sentence
  // on top of those.
  // *(changed 2026-08-14: the view used to draw nothing at all when empty.)*
  await navRow(page, 'Next 7 days').click()
  await expect(page.getByText('No todos')).toBeVisible()
  await expect(dayHeadings(page)).toHaveCount(7)
  await expect(page.getByText('Clear', { exact: true })).toHaveCount(7)

  await navRow(page, list).click()
  await addTodo(page, 'Book the venue')
  await waitForSync(page)
  await setDue(page, 'Book the venue', 4)
  await waitForSync(page)

  await navRow(page, 'Next 7 days').click()
  await expect(page.getByText('Book the venue', { exact: true })).toBeVisible()

  // Forward-looking views show outstanding work only, so there is no
  // Completed section here and the row leaves on the click. It belongs to
  // the day it was *done*, which is Today.
  await page
    .getByRole('checkbox', { name: /Book the venue/ })
    .first()
    .click()
  await waitForSync(page)
  await expect(page.getByText('Book the venue', { exact: true })).toBeHidden()
  await expect(page.getByText('No todos')).toBeVisible()

  await navRow(page, 'Today').click()
  await expect(page.getByText('Book the venue', { exact: true })).toBeVisible()
})
