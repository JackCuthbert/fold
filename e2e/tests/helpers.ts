import { expect, type Page } from '@playwright/test'

export const CALDAV_URL = 'http://127.0.0.1:5233/e2e-user/'

export async function login(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByLabel('Server URL').fill(CALDAV_URL)
  await page.getByLabel('Username').fill('e2e-user')
  await page.getByLabel('Password').fill('anything')
  await page.getByRole('button', { name: 'Sign in' }).click()
}

/** Unique per test run so runs never collide in radicale storage. */
export const uniqueName = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`

export async function createList(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: '+ New list' }).click()
  await page.getByPlaceholder('List name').fill(name)
  await page.getByRole('button', { name: 'Create', exact: true }).click()
}

// docs/specs/ui.md — the nav: per-list Rename/Delete live in a kebab menu
// at the row's right edge rather than inline icon buttons, so a list's
// full name gets nearly the whole row.
export async function openListMenu(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: `Actions for ${name}` }).click()
}

export async function renameList(
  page: Page,
  from: string,
  to: string,
): Promise<void> {
  await openListMenu(page, from)
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  const input = page.getByPlaceholder('List name')
  await input.fill(to)
  await page.getByRole('button', { name: 'Rename', exact: true }).click()
}

// docs/specs/ui.md — adding a todo opens a modal (added 2026-07-31): the
// "Add a todo" button is now the modal's trigger, not the field itself.
// The modal's title field keeps the same accessible name so Enter still
// submits and closes it in one step — the fast path is unchanged from the
// user's perspective, just behind a dialog now.
export async function addTodo(page: Page, summary: string): Promise<void> {
  await page.getByRole('button', { name: 'Add a todo' }).click()
  // The modal itself is also labelled "Add a todo" (its Dialog.Title), so
  // getByLabel would match both the dialog and the field — scope to the
  // textbox role to get just the input.
  const input = page.getByRole('textbox', { name: 'Add a todo' })
  await input.fill(summary)
  await input.press('Enter')
}

/**
 * The outbox is FIFO and drains asynchronously — a `page.reload()` right
 * after a UI action can race an in-flight mutation (the request gets
 * aborted mid-flight, then retried after reload). Waiting for the
 * "Syncing N changes" pill to clear before reloading proves the mutation
 * actually reached the server, matching what the reload assertions in
 * these specs are meant to demonstrate.
 *
 * A plain `toBeHidden()` on the pill would pass trivially if the sync
 * happened to finish (or hadn't started) the instant we check, so this
 * polls until none of "Syncing N change…" / "Offline" appear anywhere on
 * two separate samples in a row — a mutation that gets coalesced in right
 * after the first all-clear sample will still show up on the second.
 * *(changed 2026-07-31: "Server unreachable" no longer appears as pill
 * text — docs/specs/ui.md moved server reachability onto the nav footer's
 * status dot + label instead. The "Syncing \d+ change" branch only matches
 * the pill's fuller text, never the footer's plain "Syncing…" label; the
 * bare "Offline" branch intentionally also catches the footer's own
 * "Offline" label, via `.count()`, which tolerates matching both.)*
 */
export async function waitForSync(page: Page): Promise<void> {
  const isIdle = async (): Promise<boolean> =>
    (await page.getByText(/Syncing \d+ change|Offline/).count()) === 0
  await expect(async () => {
    if (!(await isIdle())) throw new Error('sync still in progress')
    await page.waitForTimeout(200)
    if (!(await isIdle())) throw new Error('sync resumed')
  }).toPass({ timeout: 15_000 })
}
