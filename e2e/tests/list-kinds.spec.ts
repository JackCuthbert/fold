import { expect, test, type Page } from '@playwright/test'
import {
  addTodo,
  createList,
  dateFieldValue,
  login,
  uniqueName,
  waitForSync,
} from './helpers'

/** The add-todo dialog, so its fields are unambiguous. */
const addDialog = (page: Page) =>
  page.getByRole('dialog', { name: 'Add a todo' })

/**
 * A list's own row in the nav.
 *
 * Scoped, and `.first()`: the plain name matches the row, its "Actions
 * for…" kebab trigger, and — on desktop, where the drawer and the pinned
 * sidebar both exist in the DOM — two copies of each.
 */
const navRow = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'Lists' })
    .getByRole('button', {
      name,
      exact: true,
    })
    .first()

// docs/specs/list-kinds.md — a list's name decides how it behaves.
//
// Exercised end to end rather than only in unit tests because the whole
// feature is a chain: the name reaches the nav, the title, the derived
// views and the header's actions by four different paths, and a unit test
// of `listKindOf` proves none of them are wired up.

test('a recognised list is marked, groups in Today, and completes in bulk', async ({
  page,
}) => {
  await login(page)

  // The name IS the feature — "Groceries" exactly, not a unique variant,
  // since whole-name matching is the rule under test. Radicale is a
  // throwaway container per run, so the fixed name cannot collide.
  await createList(page, 'Groceries')
  const other = uniqueName('work')
  await createList(page, other)

  // The sparkle marks the list in the nav and beside its own title.
  await navRow(page, 'Groceries').click()
  await expect(
    page.getByRole('button', { name: /About this grocery list/i }),
  ).toBeVisible()

  // An ordinary list gets neither the mark nor the bulk actions.
  await navRow(page, other).click()
  await expect(page.getByRole('button', { name: /About this/i })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Complete all' })).toBeHidden()

  // Due today, so they land in Today — grouping is a derived-view
  // behaviour and needs them there to be visible at all.
  await navRow(page, 'Groceries').click()
  for (const item of ['Eggs', 'Bread', 'Milk']) {
    await addTodo(page, item)
  }
  await waitForSync(page)

  // In the list itself, nothing is grouped: this is where you work
  // through items one at a time.
  await expect(page.getByText('Eggs')).toBeVisible()
  await expect(page.getByText('Milk')).toBeVisible()

  // Groceries unlock grouping and bulk complete, but not scheduling —
  // the features are per-kind, not one bundle.
  await expect(page.getByRole('button', { name: 'Schedule all' })).toBeHidden()

  // In Today, the same three collapse to one row. A todo needs a due date
  // to be in Today at all, so they are given one through the ordinary
  // edit path.
  const today = dateFieldValue()
  for (const item of ['Eggs', 'Bread', 'Milk']) {
    await page.getByText(item, { exact: true }).click()
    await page.getByLabel('Due', { exact: true }).fill(today)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
  }

  // An ungrouped todo, due the same day, so Today holds both kinds of row
  // — which is what the alignment assertion below compares.
  await navRow(page, other).click()
  await addTodo(page, 'Write the report')
  await page.getByText('Write the report', { exact: true }).click()
  await page.getByLabel('Due', { exact: true }).fill(today)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await waitForSync(page)

  await page
    .getByRole('navigation', { name: 'Lists' })
    .getByRole('button', { name: 'Today', exact: true })
    .first()
    .click()
  await expect(page.getByText('3 todos', { exact: true })).toBeVisible()
  // The header's own count is asserted in unit tests rather than here —
  // "a grouped list contributes one row" is a pure function of todos and
  // lists, checked against every case including the mixed one
  // (test/view-count-rows.test.ts). This spec covers what only it can:
  // that grouping reaches the screen.
  //
  // It previously asserted a literal "2 todos" and broke when another
  // spec's todo landed in Today. `login` now gives each test its own
  // CalDAV account (tests/helpers.ts), so that could be a literal again —
  // but the unit test is the better home for an arithmetic rule either
  // way. *(changed 2026-08-05.)*

  // The individual items are behind the group, not beside it — that is
  // the whole point of collapsing them.
  await expect(page.getByText('Eggs')).toBeHidden()

  // docs/specs/ui.md — one left edge. The group row stands in for todo
  // rows, so its glyph must sit on the checkbox column and its name where
  // a todo's title starts. Measured rather than eyeballed: the first
  // implementation was 12px out at both ends, which is small enough to
  // ship unnoticed and obvious once seen. *(added 2026-08-05.)*
  const edges = await page.evaluate(() => {
    // Scoped to <main> and matched on the *whole* trailing count, not on
    // the substring "todos": the nav's "New todo" button and the header's
    // own count line both contain it, and `querySelectorAll('button')`
    // sweeps the entire document. Locally this found the right element by
    // accident of DOM order and returned null in CI.
    // *(fixed 2026-08-05.)*
    const main = document.querySelector('main')
    const groupButton = [...(main?.querySelectorAll('button') ?? [])].find(
      (button) =>
        /Groceries\s*\d+ todos?$/.test(button.textContent?.trim() ?? ''),
    )
    const todoRow = [...(main?.querySelectorAll('li') ?? [])].find((item) =>
      item.textContent?.includes('Write the report'),
    )
    // Inlined rather than a local helper: this function body is
    // serialised into the browser, so a shared helper cannot be hoisted
    // out of it the way the linter would otherwise want.
    const groupGlyph = groupButton?.querySelector('svg')
    const checkbox = todoRow?.querySelector('svg')
    return {
      groupGlyph: groupGlyph
        ? Math.round(groupGlyph.getBoundingClientRect().left)
        : null,
      checkbox: checkbox
        ? Math.round(checkbox.getBoundingClientRect().left)
        : null,
    }
  })
  // Both found first. A selector that stops matching returns null, and
  // `null === null` would have made a broken measurement look like a
  // passing one — which is most of why the CI failure above was confusing.
  expect(edges.groupGlyph).not.toBeNull()
  expect(edges.checkbox).not.toBeNull()
  // The sparkle lands on the same column the checkbox ring does.
  expect(edges.groupGlyph).toBe(edges.checkbox)

  // The row navigates to the list rather than expanding in place.
  await page.getByRole('button', { name: /Groceries.*3 todos/ }).click()
  await expect(page.getByText('Eggs')).toBeVisible()

  // Bulk complete asks first, names the count, and ticks the lot.
  await page.getByRole('button', { name: 'Complete all' }).click()
  await expect(
    page.getByRole('alertdialog').getByText(/Complete all 3 todos\?/),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Complete them' }).click()
  await waitForSync(page)

  await expect(
    page.getByRole('button', { name: /Completed \(3\)/ }),
  ).toBeVisible()
  // Still there, but inert: the buttons are part of what a recognised
  // list is, and one that vanished took the header's height with it.
  await expect(
    page.getByRole('button', { name: 'Complete all' }),
  ).toBeDisabled()

  // A *list* view never groups, so its accordion counts todos — 3 above is
  // right. A derived view does, so its accordion must count rows: complete
  // the one ungrouped todo as well, and Today's Completed section holds
  // four todos in two rows. It said "(4)" while showing two.
  // *(added 2026-08-05.)*
  await navRow(page, other).click()
  await page
    .getByRole('checkbox', { name: 'Mark "Write the report" done' })
    .click()
  await waitForSync(page)

  await page
    .getByRole('navigation', { name: 'Lists' })
    .getByRole('button', { name: 'Today', exact: true })
    .first()
    .click()
  await expect(
    page.getByRole('button', { name: /^Completed \(2\)$/ }),
  ).toBeVisible()
})

// docs/specs/list-kinds.md — no due dates on a media list, and the
// global picker defaults to the list you are looking at.
test('a media list has no due dates, in either form', async ({ page }) => {
  await login(page)
  await createList(page, 'Reading')
  const other = uniqueName('work')
  await createList(page, other)

  // The ordinary list still has them, which is what makes their absence
  // below a decision rather than a broken form.
  await navRow(page, other).click()
  await page.getByRole('button', { name: 'Add a todo' }).click()
  await page.getByRole('button', { name: 'Advanced' }).click()
  await expect(page.getByLabel('Due', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')

  // Gone on the media list — add form...
  await navRow(page, 'Reading').click()
  await page.getByRole('button', { name: 'Add a todo' }).click()
  await page.getByRole('button', { name: 'Advanced' }).click()
  await expect(page.getByLabel('Due', { exact: true })).toBeHidden()
  // ...but priority stays, which is how you say what is next.
  await expect(page.getByLabel('Priority')).toBeVisible()
  const input = page.getByRole('textbox', { name: 'Add a todo' })
  await input.fill('Dune')
  await input.press('Enter')
  await waitForSync(page)

  // ...and the detail panel.
  await page.getByText('Dune', { exact: true }).click()
  await expect(page.getByLabel('Due', { exact: true })).toBeHidden()
  await expect(page.getByLabel('Priority')).toBeVisible()
})

test('the global add picker defaults to the list on screen', async ({
  page,
}) => {
  await login(page)
  const first = uniqueName('alpha')
  const second = uniqueName('beta')
  await createList(page, first)
  await createList(page, second)

  // Looking at a list: it is already chosen, so adding is one step.
  await navRow(page, second).click()
  await page.getByRole('button', { name: 'New todo' }).click()
  await expect(addDialog(page).getByLabel('List', { exact: true })).toHaveText(
    second,
  )
  await page.keyboard.press('Escape')

  // The default follows the selection rather than being captured once.
  await navRow(page, first).click()
  await page.getByRole('button', { name: 'New todo' }).click()
  await expect(addDialog(page).getByLabel('List', { exact: true })).toHaveText(
    first,
  )
  await page.keyboard.press('Escape')

  // On Today — which is not a list — there is still nothing to default
  // to, so the picker asks.
  await page
    .getByRole('navigation', { name: 'Lists' })
    .getByRole('button', { name: 'Today', exact: true })
    .first()
    .click()
  await page.getByRole('button', { name: 'New todo' }).click()
  await expect(
    addDialog(page).getByLabel('List', { exact: true }),
  ).not.toHaveText(first)
})

// docs/specs/list-kinds.md — health first.
test('health todos lead Today in a block of their own', async ({ page }) => {
  await login(page)
  await createList(page, 'Health')
  const other = uniqueName('work')
  await createList(page, other)

  // Health gets no bulk actions — it is ordinary todos in a list that
  // only behaves differently in the derived views.
  await navRow(page, 'Health').click()
  await expect(page.getByRole('button', { name: 'Complete all' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Schedule all' })).toBeHidden()

  const today = dateFieldValue()

  await addTodo(page, 'Take the tablets')
  await page.getByText('Take the tablets', { exact: true }).click()
  await page.getByLabel('Due', { exact: true }).fill(today)
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  // A *high priority* todo elsewhere, due the same day. The health todo
  // still leads: this is a separate block, not a priority weighting.
  await navRow(page, other).click()
  await addTodo(page, 'Urgent work thing')
  await page.getByText('Urgent work thing', { exact: true }).click()
  await page.getByLabel('Due', { exact: true }).fill(today)
  await page.getByLabel('Priority').click()
  await page.getByRole('option', { name: 'High' }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await waitForSync(page)

  await page
    .getByRole('navigation', { name: 'Lists' })
    .getByRole('button', { name: 'Today', exact: true })
    .first()
    .click()

  // The block exists, is named, and holds the health todo.
  const block = page.getByRole('region', { name: 'Health' })
  await expect(block).toBeVisible()
  await expect(block.getByText('Take the tablets')).toBeVisible()
  // The high-priority work todo is outside it, however urgent.
  await expect(block.getByText('Urgent work thing')).toBeHidden()

  // And the block is genuinely above — measured, since "leads the view" is
  // the whole feature and DOM order alone would not prove it renders first.
  const blockBox = await block.boundingBox()
  const otherRow = await page
    .getByText('Urgent work thing', { exact: true })
    .boundingBox()
  expect(blockBox).not.toBeNull()
  expect(otherRow).not.toBeNull()
  expect(blockBox!.y).toBeLessThan(otherRow!.y)

  // And it stays inside the pane's reading column. An earlier version
  // pulled its border outward into that padding so its rows would share
  // the checkbox column with the todos below — which lined the rows up but
  // broke the max width everything else respects
  // (docs/specs/list-kinds.md). Its rows may be indented; the box may not
  // escape. *(added 2026-08-05.)*
  const paneBox = await page
    .getByText('Urgent work thing', { exact: true })
    .locator('xpath=ancestor::ul')
    .first()
    .boundingBox()
  expect(paneBox).not.toBeNull()
  expect(blockBox!.x).toBeGreaterThanOrEqual(paneBox!.x)
  expect(blockBox!.x + blockBox!.width).toBeLessThanOrEqual(
    paneBox!.x + paneBox!.width,
  )

  // Completing it drops it out of the block — a finished health todo needs
  // no chasing, so it joins the ordinary Completed section.
  await block
    .getByRole('checkbox', { name: 'Mark "Take the tablets" done' })
    .click()
  await expect(block).toBeHidden()
})

test('renaming a list gives it a kind, and takes it away again', async ({
  page,
}) => {
  await login(page)
  const name = uniqueName('plain')
  await createList(page, name)
  await navRow(page, name).click()

  // Nothing special to begin with.
  await expect(page.getByRole('button', { name: 'Complete all' })).toBeHidden()

  // A kind is derived from the name on every render, never stored — so a
  // rename changes behaviour immediately, with nothing to invalidate.
  // This is also the documented escape hatch from a false positive, which
  // makes it worth proving rather than assuming.
  await page
    .getByRole('navigation', { name: 'Lists' })
    .getByRole('button', { name: `Actions for ${name}` })
    .first()
    .click()
  await page.getByRole('menuitem', { name: 'Edit' }).click()
  await page.getByPlaceholder('List name').fill('Chores')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await waitForSync(page)

  await expect(
    page.getByRole('button', { name: /About this chores list/i }),
  ).toBeVisible()
  // Chores get both bulk actions; groceries get only the one.
  await addTodo(page, 'Bins')
  await expect(page.getByRole('button', { name: 'Schedule all' })).toBeVisible()
})
