import { expect, test, type Page } from '@playwright/test'
import { addTodo, createList, login, uniqueName, waitForSync } from './helpers'

// docs/specs/search-view.md — issue #6.
//
// End to end because the matching rule is already unit-tested
// (apps/client/test/search.test.ts) and repeating it here would test the
// same behaviour twice (CLAUDE.md). What only this layer can prove is the
// wiring: that the view is reachable, that it reads the *same* fan-out the
// other derived views do rather than a cache of its own, and that the
// hidden-list filter still holds over it.

const nav = (page: Page) => page.getByRole('navigation', { name: 'Lists' })

const field = (page: Page) =>
  page.getByRole('searchbox', { name: 'Search todos' })

test('search finds todos across every list, by title and by note', async ({
  page,
}) => {
  await login(page)

  // Two lists, so a result that crosses them proves the fan-out rather
  // than a single list's query.
  const work = uniqueName('work')
  const home = uniqueName('home')
  await createList(page, work)
  await createList(page, home)

  await nav(page).getByRole('button', { name: work, exact: true }).click()
  await addTodo(page, 'Quarterly report')
  await nav(page).getByRole('button', { name: home, exact: true }).click()
  await addTodo(page, 'Buy milk')
  await waitForSync(page)

  // A note on one of them, through the ordinary edit path — the notes are
  // searched too, and nothing else in this spec would put one there.
  await page.getByText('Buy milk', { exact: true }).click()
  await page.getByRole('textbox', { name: 'Notes' }).fill('oat, not almond')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await waitForSync(page)

  await nav(page).getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Search' })).toBeVisible()

  // Focused on arrival: you came here to type, and having to click first
  // is the one obvious way to get this wrong.
  await expect(field(page)).toBeFocused()

  // A title in one list...
  await field(page).fill('report')
  await expect(page.getByText('Quarterly report')).toBeVisible()
  await expect(page.getByText('Buy milk')).toBeHidden()

  // ...and a *note* in the other, which is the half of this the issue
  // asked for explicitly. "almond" appears nowhere in any summary.
  await field(page).fill('almond')
  await expect(page.getByText('Buy milk')).toBeVisible()
  await expect(page.getByText('Quarterly report')).toBeHidden()

  // Fuzzy: the point of the library. A misspelling still finds it.
  await field(page).fill('reprot')
  await expect(page.getByText('Quarterly report')).toBeVisible()

  // Nothing matched is its own answer, and names what was searched for so
  // a typo is visible.
  await field(page).fill('zzqqxx')
  await expect(page.getByText(/Nothing matched/)).toBeVisible()
  await expect(page.getByText('Quarterly report')).toBeHidden()

  // And an untouched field is *not* an empty state — a different question
  // from "nothing matched", and the view says so rather than reporting a
  // count of zero (docs/specs/search-view.md — three states, not two).
  await field(page).fill('')
  await expect(page.getByText(/Type to search/)).toBeVisible()
})

test('a hidden list stays hidden from search', async ({ page }) => {
  await login(page)

  // The guarantee that matters most: the filter exists so a personal list
  // is not on screen during a screenshare, and a search box that surfaced
  // it anyway would defeat that from the one surface most likely to be
  // typed into in front of an audience (docs/specs/list-filter.md).
  // Two lists, because the filter trigger does not render below that
  // (list-filter-menu.tsx) — hiding your only list is a no-op, so there is
  // nothing for the control to do.
  const personal = uniqueName('personal')
  const shared = uniqueName('shared')
  await createList(page, personal)
  await createList(page, shared)
  await nav(page).getByRole('button', { name: personal, exact: true }).click()
  await addTodo(page, 'Book the appointment')
  await waitForSync(page)

  await nav(page).getByRole('button', { name: 'Search', exact: true }).click()
  await field(page).fill('appointment')
  await expect(page.getByText('Book the appointment')).toBeVisible()

  await page
    .getByRole('button', { name: /^Filter lists/ })
    .first()
    .click()
  await page.getByRole('checkbox', { name: `Show ${personal}` }).click()
  await page.keyboard.press('Escape')

  // Hiding the list you are *in* moves you to Today, so come back to
  // Search — the query is still there, and the result must not be.
  await nav(page).getByRole('button', { name: 'Search', exact: true }).click()
  await field(page).fill('appointment')
  await expect(page.getByText('Book the appointment')).toBeHidden()
  await expect(page.getByText(/Nothing matched/)).toBeVisible()

  // Unhiding brings it straight back, so this is a filter rather than a
  // hole in the index.
  await nav(page).getByText('1 list hidden').click()
  await page.getByRole('button', { name: 'Show them' }).click()
  await nav(page).getByRole('button', { name: 'Search', exact: true }).click()
  await field(page).fill('appointment')
  await expect(page.getByText('Book the appointment')).toBeVisible()
})

test('the search view has a chord, in nav order', async ({ page }) => {
  await login(page)
  // A list first, so the app is in its ordinary state rather than the
  // no-lists one — and so the assertions below wait on a settled view.
  await createList(page, uniqueName('chord'))
  await expect(page.getByRole('button', { name: 'Search' })).toBeVisible()

  // Ctrl+Shift+<n> is generated from DERIVED_VIEWS (shortcuts.ts), so this
  // is really asking whether Search was added to that list rather than
  // wired up by hand — and that appending it left the other three chords
  // where they were, which is why it went last (docs/specs/search-view.md).
  await page.locator('body').click()
  await page.keyboard.press('Control+Shift+Digit4')
  await expect(page.getByRole('heading', { name: /^Search/ })).toBeVisible()

  // Click out of the search field first. Arriving on this view focuses it
  // (search-pane.tsx), and a shortcut deliberately never steals a
  // keystroke from a text field (shortcuts.ts — isTextEntry), so the next
  // chord would correctly do nothing. That rule working is *why* this
  // line is here rather than a sign of a problem.
  await page.locator('body').click()

  // Summary still answers to 3, which is the other half of appending: no
  // chord anyone had already learned moved.
  await page.keyboard.press('Control+Shift+Digit3')
  await expect(page.getByRole('heading', { name: /^Summary/ })).toBeVisible()

  await page.keyboard.press('Control+Shift+Digit1')
  await expect(page.getByRole('heading', { name: /^Today/ })).toBeVisible()
})

// docs/specs/search-view.md — ordering and grouping. *(added 2026-08-10.)*
//
// The partition itself is unit-tested (groupSearchResults). What only this
// layer proves is that the pane renders the two groups in the right order
// with their headings, and that a finished todo cannot appear above open
// work — the actual complaint, which no unit test of a pure function sees.
test('finished work sits below open work, under its own heading', async ({
  page,
}) => {
  await login(page)

  const list = uniqueName('split')
  await createList(page, list)
  await nav(page).getByRole('button', { name: list, exact: true }).click()

  // A shared word so one query matches both, and the completed one is
  // added *first* — the bug this guards is a finished todo ranking above
  // live work, so it has to be the earlier row before grouping applies.
  await addTodo(page, 'Sharedword finished')
  await addTodo(page, 'Sharedword pending')
  await page
    .getByRole('checkbox', { name: /Sharedword finished/ })
    .first()
    .click()
  await waitForSync(page)

  await nav(page).getByRole('button', { name: 'Search', exact: true }).click()
  await field(page).fill('Sharedword')

  await expect(page.getByRole('heading', { name: /To do/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Done/ })).toBeVisible()

  // Order on the page, not merely presence: both rows are visible either
  // way, so only their relative position distinguishes grouped from
  // interleaved.
  const rows = page.getByRole('listitem').filter({ hasText: 'Sharedword' })
  await expect(rows.first()).toContainText('pending')
  await expect(rows.last()).toContainText('finished')

  // Clearing belongs where the todos live, never behind a query.
  await expect(
    page.getByRole('button', { name: /Clear completed/ }),
  ).toBeHidden()
})
