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

// The New todo modal had a backdrop of its own — so the layer *count*
// above was satisfied — but it sat at the base level, the drawer's own
// layer. Both landed on z-index 40, so instead of dimming the drawer the
// modal shared its dimming, and the drawer's contents painted over the
// popup. Counting layers cannot see that; ordering can.
// docs/specs/ui.md — overlays. *(added 2026-08-11.)*
test('mobile: a modal opened from the drawer stacks above it', async ({
  page,
}) => {
  await login(page)

  /** Every painted full-viewport layer, as z-index, lowest first. */
  const layers = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('body *')]
        .filter((element) => {
          const style = getComputedStyle(element)
          return (
            style.position === 'fixed' &&
            style.inset === '0px' &&
            style.zIndex !== 'auto'
          )
        })
        .map((element) => Number(getComputedStyle(element).zIndex))
        .toSorted((a, b) => a - b),
    )

  await page.getByRole('button', { name: 'Lists' }).click()
  const newTodo = page.getByRole('button', { name: /^New todo/ })
  await expect(newTodo).toBeVisible()

  const drawerOnly = await layers()
  expect(drawerOnly).toHaveLength(1)

  await newTodo.click()
  // By role, not placeholder: the placeholder uses a real ellipsis, and
  // the helpers already locate this field this way.
  await expect(page.getByRole('textbox', { name: 'Add a todo' })).toBeVisible()

  const withModal = await layers()
  expect(withModal).toHaveLength(2)

  // The whole point: the modal's scrim is *above* the drawer's, so the
  // drawer visibly recedes. Equal values are the bug.
  const [drawerScrim, modalScrim] = withModal
  expect(modalScrim).toBeGreaterThan(drawerScrim ?? 0)
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

// docs/specs/ui.md — a long press opens the menu and selects nothing.
//
// Long-pressing a row is how its context menu opens, and the same gesture
// used to select the summary underneath it, bringing up the OS text
// menu over ours. Base UI suppresses iOS's *callout* but sets no
// `user-select`, which is the half that actually stops the selection.
//
// Asserted as a computed style rather than by driving a long press: the
// OS text menu is chrome the page cannot see, so a gesture-based test
// could only ever check that our own menu opened — which it did before
// this fix too. The computed value is the thing that changed.
test('a todo row is not selectable on touch', async ({ page }) => {
  await login(page)

  const listName = uniqueName('press')
  await page.getByRole('button', { name: 'Lists' }).click()
  await page.getByRole('button', { name: '+ New list' }).click()
  await page.getByPlaceholder('List name').fill(listName)
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await addTodo(page, 'Long press me')

  const row = page.locator('main li').filter({ hasText: 'Long press me' })
  await expect(row).toHaveCSS('user-select', 'none')

  // The summary inherits it, so the text the press lands on is covered —
  // the row alone would not prove that if a child ever reset it.
  await expect(row.getByText('Long press me', { exact: true })).toHaveCSS(
    'user-select',
    'none',
  )
})
