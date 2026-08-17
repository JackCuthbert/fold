import { expect, test, type Page } from '@playwright/test'
import { addTodo, createList, login, uniqueName, waitForSync } from './helpers'

// docs/specs/todos.md — row actions. Right-click (or long-press) a todo
// row for the actions that would otherwise mean opening the detail panel.
// Issue #40.

/**
 * Right-click a row by its summary, and wait for the menu.
 *
 * Dismisses any menu still open first, then waits for it to be gone. Base
 * UI keeps an inert backdrop over the page while a menu closes, and it
 * swallows the next click — so re-opening one straight after choosing from
 * it hung until the test timed out rather than failing on anything
 * meaningful. Choosing from a *submenu* leaves both levels up, which is
 * why this dismisses rather than assuming a click closed things.
 * *(added 2026-08-11.)*
 */
async function openRowMenu(page: Page, summary: string): Promise<void> {
  const menus = page.getByRole('menu')
  while ((await menus.count()) > 0) await page.keyboard.press('Escape')
  await expect(menus).toHaveCount(0)
  await page.getByText(summary, { exact: true }).click({ button: 'right' })
  await expect(menus.first()).toBeVisible()
}

/**
 * Open one of the two submenus by hovering its trigger.
 *
 * Schedule and Priority are nested (docs/specs/todos.md — row actions), so
 * their items only exist once the submenu opens. Hover rather than click:
 * that is how a pointer reaches them, and it exercises the path a user
 * actually takes.
 */
async function openSubmenu(page: Page, name: string): Promise<void> {
  await page.getByRole('menuitem', { name: new RegExp(`^${name}`) }).hover()
  // The submenu is a second menu — wait for it rather than for any menu,
  // which the parent already satisfies.
  await expect(page.getByRole('menu')).toHaveCount(2)
}

test('right-clicking a todo row opens its actions', async ({ page }) => {
  await login(page)
  await createList(page, uniqueName('menu'))
  await addTodo(page, 'Ring the vet')

  await openRowMenu(page, 'Ring the vet')

  // The top level is five rows, not ten: Schedule and Priority are
  // submenus (docs/specs/todos.md — row actions). Asserted as a set so a
  // silently-dropped action, or one that escapes back to the top level,
  // fails here rather than in a later spec.
  await expect(page.getByRole('menuitem')).toHaveText([
    'Mark as done',
    'Schedule',
    // A plain label. It briefly carried the current value, which made the
    // row's width move with the priority — see todo-context-menu.tsx.
    'Priority',
    'Move to…',
    'Delete',
  ])

  // And the nested items are genuinely nested — absent until asked for.
  await expect(page.getByRole('menuitemradio')).toHaveCount(0)
  await expect(page.getByRole('menuitem', { name: 'Today' })).toBeHidden()
})

test('the schedule submenu holds the date actions', async ({ page }) => {
  await login(page)
  await createList(page, uniqueName('sub'))
  await addTodo(page, 'Sweep the deck')

  await openRowMenu(page, 'Sweep the deck')
  await openSubmenu(page, 'Schedule')

  // The trigger stays marked while its submenu is open, so the popup reads
  // as anchored to the row it belongs to. `data-highlighted` follows the
  // pointer, so it goes flat the moment you move into the submenu — this
  // hangs off `data-popup-open` instead. *(added 2026-08-11.)*
  await expect(
    page.getByRole('menuitem', { name: /^Schedule/ }),
  ).toHaveAttribute('data-popup-open', '')

  // Six items: two days each paired with a timed button, the two weekend
  // days, and Clear. Matched by accessible name rather than text, because
  // the timed buttons carry an icon and an `aria-label` and no text at all
  // — which is exactly what a screen reader has to work with.
  // *(changed 2026-08-17: was four flat rows plus Clear.)*
  const submenu = page.getByRole('menu').nth(1)
  const items = submenu.getByRole('menuitem')
  await expect(items).toHaveCount(7)
  const names = [
    'Today',
    /^Today at \d/,
    'Tomorrow',
    /^Tomorrow at \d/,
    'This Saturday',
    'This Sunday',
    'Clear due date',
  ]
  for (const [index, name] of names.entries()) {
    await expect(items.nth(index)).toHaveAccessibleName(name)
  }
})

// The timed option used to be its own row and is now a button beside the
// day. A nested control inside a menu item is reachable by mouse and
// nowhere else, so this is the test that the pairing did not quietly cost
// keyboard users the option. *(added 2026-08-17.)*
test('the timed option is reachable with the keyboard', async ({ page }) => {
  // Mid-morning, so "Today 5:00 pm" is still ahead. Its own past-the-hour
  // guard disables it after 5pm, and a disabled item cannot take focus —
  // which made this fail on a real clock rather than on the thing it
  // tests. *(pinned 2026-08-17.)*
  await page.clock.setFixedTime(new Date(2026, 7, 11, 9, 15))
  await login(page)
  await createList(page, uniqueName('kbd'))
  await addTodo(page, 'Chase the invoice')

  await openRowMenu(page, 'Chase the invoice')
  await openSubmenu(page, 'Schedule')

  // ArrowDown walks the items in DOM order, so the time button is simply
  // the next stop after its day. The two-column grid is purely visual —
  // the items stay a flat list, which is what keeps this working.
  const submenu = page.getByRole('menu').nth(1)
  await submenu.getByRole('menuitem', { name: 'Today', exact: true }).focus()
  await page.keyboard.press('ArrowDown')
  await expect(
    submenu.getByRole('menuitem', { name: /^Today at \d/ }),
  ).toBeFocused()

  // And onward, rather than trapped on the button: a wrapper element
  // around the pair broke this outright before the popup became a grid of
  // direct children.
  await page.keyboard.press('ArrowDown')
  await expect(
    submenu.getByRole('menuitem', { name: 'Tomorrow', exact: true }),
  ).toBeFocused()
})

// docs/specs/todos.md — quick scheduling. "This Saturday" counts today as
// zero, so on a Saturday it means today rather than a week out.
test('the weekend actions schedule the coming Saturday', async ({ page }) => {
  // A Tuesday, so the coming Saturday is four days out and unambiguous.
  await page.clock.setFixedTime(new Date(2026, 7, 18, 9, 0))
  await login(page)
  await createList(page, uniqueName('weekend'))
  await addTodo(page, 'Clean the gutters')

  await openRowMenu(page, 'Clean the gutters')
  await openSubmenu(page, 'Schedule')
  await page.getByRole('menuitem', { name: 'This Saturday' }).click()

  // The 22nd is the Saturday after that Tuesday. Matched loosely because
  // the pill is locale-formatted — "Aug 22" or "22 Aug" depending on the
  // browser's locale, and the date is what this test is about.
  const row = page.locator('li').filter({ hasText: 'Clean the gutters' })
  await expect(row).toContainText(/22/)
})

test('a timed schedule option sets the time, not just the date', async ({
  page,
}) => {
  // Pinned, so the assertion is about the option writing 9:00 rather than
  // about what time the suite happens to run at. *(pinned 2026-08-11.)*
  await page.clock.setFixedTime(new Date(2026, 7, 11, 9, 15))
  await login(page)
  await createList(page, uniqueName('timed'))
  await addTodo(page, 'Ring the plumber')

  await openRowMenu(page, 'Ring the plumber')
  await openSubmenu(page, 'Schedule')
  await page.getByRole('menuitem', { name: /^Tomorrow at \d/ }).click()

  // An undated todo gains both the date and the time — the whole point of
  // the timed pair (docs/specs/todos.md — row actions).
  const row = page.locator('li').filter({ hasText: 'Ring the plumber' })
  await expect(row).toContainText('9:00')
  await waitForSync(page)

  // And it is genuinely tomorrow, not merely timed.
  await page.getByRole('button', { name: 'Tomorrow' }).first().click()
  await expect(row).toBeVisible()
})

test('priority is a submenu of four colour-coded choices', async ({ page }) => {
  await login(page)
  await createList(page, uniqueName('prio'))
  await addTodo(page, 'Check the roof')

  await openRowMenu(page, 'Check the roof')
  await openSubmenu(page, 'Priority')

  // Four choices, including "None" — a value you set, not merely the
  // absence of one (docs/specs/todos.md — row actions).
  await expect(page.getByRole('menuitemradio')).toHaveText([
    'High',
    'Medium',
    'Low',
    'None',
  ])
  // An unprioritised todo starts on None, so something is always marked.
  await expect(
    page.getByRole('menuitemradio', { name: 'None' }),
  ).toHaveAttribute('aria-checked', 'true')

  await page.getByRole('menuitemradio', { name: 'High' }).click()

  // The row's meta pill is the evidence it applied. Lowercase: the pill
  // renders the rank as the schema stores it.
  const row = page.locator('li').filter({ hasText: 'Check the roof' })
  await expect(row).toContainText('high')

  // Re-opening shows the new value as the checked item.
  await openRowMenu(page, 'Check the roof')
  await openSubmenu(page, 'Priority')
  await expect(
    page.getByRole('menuitemradio', { name: 'High' }),
  ).toHaveAttribute('aria-checked', 'true')

  // And it can be taken away again, which is the whole reason None is one
  // of the four.
  await page.getByRole('menuitemradio', { name: 'None' }).click()
  await expect(row).not.toContainText('high')
})

test('the row whose menu is open is marked while it is open', async ({
  page,
}) => {
  await login(page)
  await createList(page, uniqueName('marked'))
  await addTodo(page, 'Book the car in')

  const row = page.locator('li').filter({ hasText: 'Book the car in' })
  const background = () =>
    row.evaluate((element) => getComputedStyle(element).backgroundColor)

  // Transparent at rest. `rgba(…, 0)` is what an unset background computes
  // to, so this is the "no wash" assertion.
  expect(await background()).toContain('0)')

  await openRowMenu(page, 'Book the car in')
  // Base UI sets data-popup-open on the trigger, which *is* the row — so
  // the marking needs no React state (todos/todo-item.module.css).
  await expect(row).toHaveAttribute('data-popup-open', '')
  expect(await background()).not.toContain(', 0)')
})

test('scheduling from the menu moves the due date, keeping the time', async ({
  page,
}) => {
  await login(page)
  const list = uniqueName('sched')
  await createList(page, list)
  await addTodo(page, 'Collect the parcel')

  // Give it a time first, through the detail panel, so the assertion below
  // is about the time *surviving* rather than about an all-day todo. Both
  // switches seed a value when turned on (todos/due-controls): the date
  // becomes today, the time 09:00.
  await page.getByText('Collect the parcel', { exact: true }).click()
  await page.getByRole('switch').first().click()
  await page.getByRole('switch').nth(1).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await waitForSync(page)

  await openRowMenu(page, 'Collect the parcel')
  await openSubmenu(page, 'Schedule')
  // `exact`: the submenu also holds "Tomorrow 9:00 AM" now, which a
  // substring match would tie with. This test is about the *plain* one,
  // which keeps the time the todo already had.
  await page.getByRole('menuitem', { name: 'Tomorrow', exact: true }).click()

  const row = page.locator('li').filter({ hasText: 'Collect the parcel' })

  // Wait for the *effect* of the write on the view already on screen —
  // this test's own list, where the row stays whatever its due date. The
  // meta pill is the direct evidence, and waiting on it here is what
  // makes the navigation below deterministic: without it the nav click
  // could land mid-update, and the assertion after it read the row as the
  // previous view still had it. That failed roughly one run in three
  // under full-suite load while passing every time alone.
  // *(made deterministic 2026-08-11.)*
  await expect(row).toContainText('9:00')

  await waitForSync(page)

  // And it is genuinely due *tomorrow*, not merely still timed: it now
  // appears in the Tomorrow view, which selects on the date alone.
  await page.getByRole('button', { name: 'Tomorrow' }).first().click()
  await expect(row).toBeVisible()
  // The time rode along with the date — the whole point of scheduledDue
  // (todos/lib/schedule.ts). Dropping it would silently discard what the
  // row is displaying. 9:00 is what the Time switch seeds.
  await expect(row).toContainText('9:00')
})

test('clear due date is disabled when there is no due date', async ({
  page,
}) => {
  await login(page)
  await createList(page, uniqueName('undated'))
  await addTodo(page, 'Someday thing')

  await openRowMenu(page, 'Someday thing')
  await openSubmenu(page, 'Schedule')
  // Disabled rather than absent, so the submenu keeps one shape wherever
  // it is opened — same reasoning as Move up/down in the list kebab.
  const clear = page.getByRole('menuitem', { name: 'Clear due date' })
  await expect(clear).toHaveAttribute('data-disabled', '')

  // And it does not light up under the pointer. Base UI sets
  // `data-highlighted` on a disabled item anyway — the attribute follows
  // the pointer, not whether the item can be used — so without an explicit
  // rule it washed exactly like a live row, promising a click that does
  // nothing. *(added 2026-08-11.)*
  await clear.hover()
  await expect(clear).toHaveAttribute('data-highlighted', '')
  await expect(clear).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(clear).toHaveCSS('cursor', 'not-allowed')
})

test('deleting from the menu asks first, and names the todo', async ({
  page,
}) => {
  await login(page)
  await createList(page, uniqueName('del'))
  await addTodo(page, 'Cancel the subscription')

  await openRowMenu(page, 'Cancel the subscription')
  await page.getByRole('menuitem', { name: 'Delete' }).click()

  // The confirm names the todo: a long-press may have landed on the wrong
  // row, and this is what makes that visible before the answer is given.
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('Cancel the subscription')

  // Cancelling leaves it alone.
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(
    page.getByText('Cancel the subscription', { exact: true }),
  ).toBeVisible()

  // Confirming removes it, and it stays removed after a round trip.
  await openRowMenu(page, 'Cancel the subscription')
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete' })
    .click()
  await expect(
    page.getByText('Cancel the subscription', { exact: true }),
  ).toBeHidden()

  await waitForSync(page)
  await page.reload()
  await expect(
    page.getByText('Cancel the subscription', { exact: true }),
  ).toBeHidden()
})

test('completing from the menu ticks the row', async ({ page }) => {
  await login(page)
  await createList(page, uniqueName('done'))
  await addTodo(page, 'Water the plants')

  await openRowMenu(page, 'Water the plants')
  await page.getByRole('menuitem', { name: 'Mark as done' }).click()

  await expect(
    page.getByRole('button', { name: 'Completed (1)' }),
  ).toBeVisible()

  // And the menu now offers the opposite, rather than the same label.
  await page.getByRole('button', { name: 'Completed (1)' }).click()
  await openRowMenu(page, 'Water the plants')
  await expect(
    page.getByRole('menuitem', { name: 'Mark as active' }),
  ).toBeVisible()
})

test('a schedule option that would change nothing is disabled', async ({
  page,
}) => {
  // Mid-morning, so "Today 5:00 pm" is still ahead and its own
  // past-the-hour guard cannot be what disables it — this test is about
  // the no-op rule, and the two must not be confused. Caught by this test
  // failing when run after 5pm real time. *(pinned 2026-08-11.)*
  await page.clock.setFixedTime(new Date(2026, 7, 11, 9, 15))
  await login(page)
  await createList(page, uniqueName('noop'))
  await addTodo(page, 'Water the ferns')

  // Undated: every option is live except Clear due date.
  await openRowMenu(page, 'Water the ferns')
  await openSubmenu(page, 'Schedule')
  const today = page.getByRole('menuitem', { name: 'Today', exact: true })
  await expect(today).not.toHaveAttribute('data-disabled', '')
  await today.click()

  // Now due today, "Today" would write back what it already has — a
  // no-op that still costs a round-trip and reads as a broken button
  // (docs/specs/todos.md — row actions).
  await openRowMenu(page, 'Water the ferns')
  await openSubmenu(page, 'Schedule')
  await expect(
    page.getByRole('menuitem', { name: 'Today', exact: true }),
  ).toHaveAttribute('data-disabled', '')

  // But adding a *time* to it is a real change, so that stays live —
  // which is why this compares the whole due value, not just the date.
  await expect(
    page.getByRole('menuitem', { name: /^Today at \d/ }),
  ).not.toHaveAttribute('data-disabled', '')
})

test('"Today 5pm" is disabled once 5pm has gone', async ({ page }) => {
  // Late evening. Offering an end-of-day time that has already passed
  // would create an instantly-overdue todo, which is worse than not
  // offering the shortcut (docs/specs/todos.md — row actions).
  await page.clock.setFixedTime(new Date(2026, 7, 11, 21, 30))
  await login(page)
  await createList(page, uniqueName('late'))
  // No date words in the summary: quick add parses them, so "Late night
  // todo" was filed as "Late todo" with a due time attached
  // (docs/specs/quick-add.md — testing).
  // *(renamed 2026-08-14, found in review.)*
  await addTodo(page, 'Bins out')

  await openRowMenu(page, 'Bins out')
  await openSubmenu(page, 'Schedule')

  await expect(
    page.getByRole('menuitem', { name: /^Today at \d/ }),
  ).toHaveAttribute('data-disabled', '')
  // Tomorrow morning is unaffected — it is a different day.
  await expect(
    page.getByRole('menuitem', { name: /^Tomorrow at \d/ }),
  ).not.toHaveAttribute('data-disabled', '')
})
