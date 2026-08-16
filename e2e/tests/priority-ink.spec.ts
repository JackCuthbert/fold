import { expect, test } from '@playwright/test'
import { addTodo, createList, login, uniqueName, waitForSync } from './helpers'

/**
 * A priority rank must read the same wherever it is shown and wherever it
 * is chosen (docs/specs/todos.md — "the same colours apply wherever a
 * priority is *set*, not only where it is displayed").
 *
 * Low was the one that disagreed *visibly* — the detail panel's option drew
 * it green from `styles/priority.module.css` while the row's pill kept the
 * neutral `--muted` fill, so picking green produced grey. All three turned
 * out to disagree once looked at, which is why this compares every rank
 * rather than the one that was noticed.
 *
 * **Run under Catppuccin dark**, not the default palette. High's divergence
 * existed only there: `--status-offline` is literally `var(--danger)` in
 * tokens.css and every other palette leaves it alone, so a comparison on
 * Parchment comes up equal against the *broken* CSS and proves nothing.
 * Catppuccin dark is the one variant that sets the two apart (#f38ba8 vs
 * #e0705f). The other two ranks fail here on the old CSS just as they would
 * anywhere.
 *
 * Deliberately **no expected colour**: asserting `#4f7a52` would test the
 * token's current value — a shape test, and one a palette change would
 * break for no reason. Comparing the two surfaces to each other tests the
 * thing that actually failed.
 *
 * **Its own file on purpose.** These tests hover to open a submenu and
 * finish with the detail panel open, and Playwright shares one browser
 * context across a file — so run beside `todo-context-menu.spec.ts` they
 * left a pointer parked over the list, and "the row whose menu is open is
 * marked while it is open" (which asserts a row is transparent *at rest*)
 * read a live `:hover` wash instead. Clearing the theme and parking the
 * mouse in an `afterEach` both failed to fix it reliably — it still went
 * red in two runs of three, because the wash depends on where a re-rendered
 * row lands under a stationary cursor. A separate file gets a separate
 * context, which removes the coupling rather than timing around it.
 *
 * *(added 2026-08-14 with the Medium and High fix; split out of
 * todo-context-menu.spec.ts the same day for the reason above.)*
 */
test.describe('priority ink', () => {
  // Pin the palette before any script runs, so the first paint is already
  // Catppuccin dark rather than the default (theme/theme.ts — the theme is
  // browser-local, validated out of `fold-theme`). `typeface` is defaulted
  // by the schema, so it can be left out.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'fold-theme',
        JSON.stringify({ palette: 'catppuccin', mode: 'dark' }),
      )
    })
  })

  for (const rank of ['High', 'Medium', 'Low'] as const) {
    test(`${rank} reads the same on the row as in the picker`, async ({
      page,
    }) => {
      await login(page)
      await createList(page, uniqueName('ink'))
      await addTodo(page, 'Clean the gutters')

      // Set the rank from the row's context menu — hover opens the nested
      // submenu, which is how a pointer reaches it.
      await page.getByText('Clean the gutters', { exact: true }).click({
        button: 'right',
      })
      await expect(page.getByRole('menu').first()).toBeVisible()
      await page.getByRole('menuitem', { name: /^Priority/ }).hover()
      await expect(page.getByRole('menu')).toHaveCount(2)
      await page.getByRole('menuitemradio', { name: rank }).click()
      await waitForSync(page)

      // The pill stores the rank lowercase, as the schema does.
      const pill = page
        .locator('li')
        .filter({ hasText: 'Clean the gutters' })
        .getByText(rank.toLowerCase(), { exact: true })
      const pillInk = await pill.evaluate((el) => getComputedStyle(el).color)

      // The detail panel's dropdown is the surface that sets it — one of
      // the three composing `styles/priority.module.css`, so this covers
      // the add-todo modal's and the context menu's by construction.
      //
      // Dismiss the menu first: choosing from a *submenu* leaves both
      // levels up, and Base UI's inert backdrop swallows the next click.
      const menus = page.getByRole('menu')
      while ((await menus.count()) > 0) await page.keyboard.press('Escape')
      await expect(menus).toHaveCount(0)

      await page.getByText('Clean the gutters', { exact: true }).click()
      await page.getByRole('combobox', { name: 'Priority' }).click()
      const optionInk = await page
        .getByRole('option', { name: rank })
        .evaluate((el) => getComputedStyle(el).color)

      expect(optionInk).toBe(pillInk)
    })
  }
})
