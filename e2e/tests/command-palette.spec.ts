import { expect, test, type Page } from '@playwright/test'
import { createList, login, uniqueName } from './helpers'

/**
 * docs/specs/command-palette.md — `Ctrl+K` reaches every action in the app.
 *
 * **What this covers, and what it does not.** The filter's ranking and the
 * grouping are pure functions with their own unit tests
 * (commands/lib/command-filter.test.ts), and re-checking them through a
 * browser would be slower and no more truthful. This asserts the things
 * only an end-to-end test can: that the chord opens it, that the keys walk
 * it, that choosing a row performs the action, and — the one capability
 * the palette adds that nothing else has — that a list can be reached by
 * typing its name.
 */

const palette = (page: Page) =>
  page.getByRole('dialog').filter({ has: page.getByLabel('Type a command') })

const field = (page: Page) => page.getByLabel('Type a command')

/** The highlighted row, which is what Enter would run. */
const active = (page: Page) =>
  page.locator('[role="option"][aria-selected="true"]')

async function openPalette(page: Page): Promise<void> {
  // Focus somewhere neutral first. A shortcut deliberately stands down
  // while a field has focus (shortcuts.ts — isTextEntryTarget), and
  // `login` and `createList` both end with the caret in a form, so the
  // chord would be swallowed by the app doing exactly the right thing.
  // Pressing it from the page body is what a person does.
  await page.getByRole('main').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('Control+k')
  await expect(field(page)).toBeVisible()
}

test('Ctrl+K opens the palette, Escape closes it having run nothing', async ({
  page,
}) => {
  await login(page)
  // The *view's* title, not `getByRole('heading').first()` — the nav has
  // its own heading, and which one comes first changes with the layout.
  const title = page.getByRole('heading', { name: 'Today' })
  await expect(title).toBeVisible()

  await openPalette(page)
  await page.keyboard.press('Escape')
  await expect(field(page)).toBeHidden()

  // Nothing ran: still on the view we opened it from.
  await expect(title).toBeVisible()
})

test('typing filters, and Enter runs the highlighted command', async ({
  page,
}) => {
  await login(page)
  await openPalette(page)

  await field(page).fill('summ')
  // The top row is the highlighted one — the index walks the order the
  // reader sees, not the order the fuzzy matcher returned.
  await expect(active(page)).toContainText('Summary')

  await page.keyboard.press('Enter')
  await expect(field(page)).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Summary' })).toBeVisible()
})

test('both arrow keys and Ctrl+N/P walk the list', async ({ page }) => {
  await login(page)
  await openPalette(page)

  // A query with two matches in a known order: "New todo" sits under
  // Create, "Today" under Go to, so the frame decides the order rather
  // than the ranking.
  await field(page).fill('tod')
  await expect(active(page)).toContainText('New todo')

  await page.keyboard.press('ArrowDown')
  await expect(active(page)).toContainText('Today')
  await page.keyboard.press('ArrowUp')
  await expect(active(page)).toContainText('New todo')

  // The readline pair, which quick add's `#` autocomplete also honours.
  await page.keyboard.press('Control+n')
  await expect(active(page)).toContainText('Today')
  await page.keyboard.press('Control+p')
  await expect(active(page)).toContainText('New todo')
})

test('a list can be reached by typing its name', async ({ page }) => {
  await login(page)
  const list = uniqueName('palette')
  await createList(page, list)

  await openPalette(page)
  // The one thing the palette does that nothing else can: a list is user
  // data and can never have a keyboard chord of its own.
  await field(page).fill(list.slice(0, 8))
  await expect(active(page)).toContainText(list)

  await page.keyboard.press('Enter')
  await expect(field(page)).toBeHidden()
  await expect(page.getByRole('heading', { name: list })).toBeVisible()
})

test('a query matching nothing says so', async ({ page }) => {
  await login(page)
  await openPalette(page)

  await field(page).fill('zzzzzzzz')
  await expect(palette(page)).toContainText('No commands match')
  // Deliberately offers nothing else — searching todos belongs to the
  // Search view (docs/specs/search-view.md), not here.
  await expect(active(page)).toHaveCount(0)
})

test('the help modal lists the palette chord', async ({ page }) => {
  await login(page)
  // Out of the sign-in form first — a shortcut stands down while a field
  // has focus, same as `openPalette` above.
  await page.getByRole('main').click({ position: { x: 5, y: 5 } })
  // The map documents itself: a binding that exists must appear in Help,
  // and its name comes from the command it runs rather than from a
  // description on the binding.
  await page.keyboard.press('Control+/')
  const help = page.getByRole('dialog', { name: 'Help' })
  await expect(help).toBeVisible()
  await expect(help).toContainText('Open the command palette')
})
