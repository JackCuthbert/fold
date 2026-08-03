import { expect, test } from '@playwright/test'
import { addTodo, login, uniqueName } from './helpers'

test('mobile: drawer navigation and core flow', async ({ page }) => {
  await login(page)

  await page.getByRole('button', { name: 'Lists' }).click()
  const listName = uniqueName('mobile')
  await page.getByRole('button', { name: '+ New list' }).click()
  await page.getByPlaceholder('List name').fill(listName)
  await page.getByRole('button', { name: 'Create', exact: true }).click()

  await expect(page.getByRole('heading', { name: listName })).toBeVisible()
  await addTodo(page, 'Mobile todo')
  await page.getByRole('checkbox', { name: 'Mark "Mobile todo" done' }).click()
  await expect(
    page.getByRole('button', { name: 'Completed (1)' }),
  ).toBeVisible()
})

// Issue #20. On mobile the nav renders inside the drawer's Dialog.Popup, so
// a modal owned there is a *nested* dialog — and Base UI suppresses a
// nested dialog's backdrop by design. The New list modal re-used the
// drawer's scrim and appeared to float on the nav rather than over the app.
// The fix is structural (MainScreen owns the modal, as a sibling of the
// drawer), so the assertion is on the rendered result: its own scrim.
test('mobile: the New list modal has its own scrim over the drawer', async ({
  page,
}) => {
  await login(page)

  // Counts the full-viewport dimming layers actually painted. Matching on
  // computed style rather than a class name keeps this about the rendered
  // result — the bug was a *missing layer*, not a missing class.
  const dimmers = () =>
    page.evaluate(
      () =>
        [...document.querySelectorAll('body *')].filter((element) => {
          const style = getComputedStyle(element)
          return style.position === 'fixed' && style.inset === '0px'
        }).length,
    )

  await page.getByRole('button', { name: 'Lists' }).click()
  await expect(page.getByRole('button', { name: '+ New list' })).toBeVisible()
  const withDrawerOnly = await dimmers()

  await page.getByRole('button', { name: '+ New list' }).click()
  await expect(page.getByPlaceholder('List name')).toBeVisible()

  // The modal brought a backdrop of its own rather than borrowing the
  // drawer's — precisely what a nested Base UI dialog fails to do.
  expect(await dimmers()).toBeGreaterThan(withDrawerOnly)
})

// Issue #21. ListNav is rendered by two different trees either side of
// 768px, so a modal owned there unmounted on a resize: a half-typed list
// vanished and reopening started from scratch. A layout change is not a
// dismissal — the draft must survive it.
test('a half-typed new list survives crossing the breakpoint', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page)

  const listName = uniqueName('resized')
  await page.getByRole('button', { name: '+ New list' }).click()
  await page.getByPlaceholder('List name').fill(listName)

  // Cross into mobile, then back out.
  await page.setViewportSize({ width: 375, height: 812 })
  await expect(page.getByPlaceholder('List name')).toHaveValue(listName)
  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(page.getByPlaceholder('List name')).toHaveValue(listName)

  // And it still creates the list it was holding.
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByRole('heading', { name: listName })).toBeVisible()
})
