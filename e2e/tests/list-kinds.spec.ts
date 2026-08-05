import { expect, test, type Page } from '@playwright/test'
import { addTodo, createList, login, uniqueName, waitForSync } from './helpers'

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
  // Local date parts, not `toISOString()` — that converts to UTC first
  // and lands on the wrong day either side of midnight.
  const now = new Date()
  const today = [
    String(now.getFullYear()),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
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
  await expect(page.getByText('3 items')).toBeVisible()
  // The individual items are behind the group, not beside it — that is
  // the whole point of collapsing them.
  await expect(page.getByText('Eggs')).toBeHidden()

  // docs/specs/ui.md — one left edge. The group row stands in for todo
  // rows, so its glyph must sit on the checkbox column and its name where
  // a todo's title starts. Measured rather than eyeballed: the first
  // implementation was 12px out at both ends, which is small enough to
  // ship unnoticed and obvious once seen. *(added 2026-08-05.)*
  const edges = await page.evaluate(() => {
    const groupButton = [...document.querySelectorAll('button')].find(
      (button) => button.textContent?.includes('items'),
    )
    const todoRow = [...document.querySelectorAll('li')].find((item) =>
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
  // The sparkle lands on the same column the checkbox ring does.
  expect(edges.groupGlyph).toBe(edges.checkbox)

  // The row navigates to the list rather than expanding in place.
  await page.getByRole('button', { name: /Groceries.*3 items/ }).click()
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
  // Nothing left to act on, so the control that would act on nothing goes.
  await expect(page.getByRole('button', { name: 'Complete all' })).toBeHidden()
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
