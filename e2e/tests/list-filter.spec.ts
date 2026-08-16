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

const nav = (page: Page) => page.getByRole('navigation', { name: 'Lists' })

const navRow = (page: Page, name: string) =>
  nav(page).getByRole('button', { name, exact: true }).first()

/** The filter's icon button, in the nav's title row. */
const filterTrigger = (page: Page) =>
  page.getByRole('button', { name: /^Filter lists/ }).first()

// docs/specs/list-filter.md
//
// End to end because the feature is only worth anything if it reaches all
// three places at once — the nav, the derived views and what is stored.
// A unit test of `visibleLists` proves none of them are wired together.

test('hiding a list removes it from the nav and the derived views', async ({
  page,
}) => {
  await login(page)

  const personal = uniqueName('personal')
  const work = uniqueName('work')
  await createList(page, personal)
  await createList(page, work)

  // One todo in each, both due today, so Today shows both lists. The due
  // date goes on through the ordinary edit path, in the todo's *own* list
  // — a todo is only on screen in the list you are looking at.
  for (const [list, summary] of [
    [personal, 'Book the appointment'],
    [work, 'Write the report'],
  ] as const) {
    await navRow(page, list).click()
    await addTodo(page, summary)
    await waitForSync(page)
    await page.getByText(summary, { exact: true }).click()
    await setDueDate(page, dateFieldValue())
    await page.getByRole('button', { name: 'Save', exact: true }).click()
  }
  await waitForSync(page)

  await navRow(page, 'Today').click()
  await expect(page.getByText('Book the appointment')).toBeVisible()

  // Hide the personal list.
  await filterTrigger(page).click()
  await page.getByRole('checkbox', { name: `Show ${personal}` }).click()
  await page.keyboard.press('Escape')

  // Gone from the derived view *and* from the nav — the second is the
  // point. Filtering the views while leaving the name legible in the
  // sidebar would defeat the purpose during a screenshare.
  await expect(page.getByText('Book the appointment')).toBeHidden()
  await expect(page.getByText('Write the report')).toBeVisible()
  await expect(navRow(page, personal)).toBeHidden()
  await expect(navRow(page, work)).toBeVisible()

  // And it says so, where the missing row was.
  await expect(nav(page).getByText('1 list hidden')).toBeVisible()

  // Surviving a reload is the whole point of persisting it: a filter that
  // reset itself would have to be re-checked every time you doubted it.
  await page.reload()
  await expect(navRow(page, personal)).toBeHidden()
  await expect(nav(page).getByText('1 list hidden')).toBeVisible()

  // Revealing asks first — a stray click mid-call is what this guards.
  await nav(page).getByText('1 list hidden').click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('button', { name: 'Show them' }).click()

  await expect(navRow(page, personal)).toBeVisible()
  await expect(nav(page).getByText('1 list hidden')).toBeHidden()
  await expect(page.getByText('Book the appointment')).toBeVisible()
})

test('a list created while others are hidden is still visible', async ({
  page,
}) => {
  await login(page)

  const first = uniqueName('alpha')
  const second = uniqueName('beta')
  await createList(page, first)
  await createList(page, second)

  await filterTrigger(page).click()
  await page.getByRole('checkbox', { name: `Show ${first}` }).click()
  await page.keyboard.press('Escape')
  await expect(navRow(page, first)).toBeHidden()

  // The filter stores what to *hide*, so a list it has never heard of is
  // shown. Storing what to show instead would make this one invisible —
  // work silently swallowed by a setting from before it existed, which is
  // the one failure this feature must not have
  // (docs/specs/list-filter.md).
  const later = uniqueName('gamma')
  await createList(page, later)
  await expect(navRow(page, later)).toBeVisible()
  await expect(navRow(page, first)).toBeHidden()
})
