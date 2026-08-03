import { expect, test } from '@playwright/test'
import {
  addTodo,
  createList,
  login,
  openListMenu,
  renameList,
  uniqueName,
  waitForSync,
} from './helpers'

test('login → create list → add → complete → delete', async ({ page }) => {
  await login(page)

  const listName = uniqueName('groceries')
  await createList(page, listName)
  await expect(page.getByRole('heading', { name: listName })).toBeVisible()

  await addTodo(page, 'Buy milk')
  await expect(page.getByText('Buy milk')).toBeVisible()
  // docs/specs/ui.md — accessibility: focus must not land somewhere
  // misleading after an action. Submitting the add-todo form with Enter
  // used to leave focus on the first row's checkbox once it re-rendered,
  // which then read as focused/selected — regression coverage for that.
  // It should rest on the "Add a todo" trigger that opened the dialog.
  await expect(page.getByRole('button', { name: 'Add a todo' })).toBeFocused()
  await expect(
    page.getByRole('checkbox', { name: 'Mark "Buy milk" done' }),
  ).not.toBeFocused()

  await addTodo(page, 'Buy bread')
  await expect(page.getByText('Buy milk')).toBeVisible()
  await expect(page.getByText('Buy bread')).toBeVisible()
  // Let both creates round-trip before completing/deleting — the
  // completed/delete requests carry the ETag the client has cached, and
  // that's only the server's real ETag once the create has synced.
  await waitForSync(page)

  await page.getByRole('checkbox', { name: 'Mark "Buy milk" done' }).click()
  await expect(
    page.getByRole('button', { name: 'Completed (1)' }),
  ).toBeVisible()

  // docs/specs/todos.md — clearing completed todos: there is no bulk
  // delete; a completed todo is the only record that the work was done.
  // Deleting one goes through its detail sheet, one at a time.
  // *(changed 2026-08-02: was "Clear completed" + "Delete 1".)*
  await page.getByRole('button', { name: 'Completed (1)' }).click()
  await page.getByText('Buy milk').click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('Buy milk')).toBeHidden()
  await expect(page.getByText('Buy bread')).toBeVisible()

  // Survives a reload — it's really on the server, not just the cache.
  await waitForSync(page)
  await page.reload()
  await expect(page.getByText('Buy bread')).toBeVisible()
})

// docs/specs/ui.md — the nav: per-list Rename/Delete live in a kebab menu,
// keyboard navigable via Base UI's Menu, rather than inline icon buttons.
test('rename and delete a list via its kebab menu', async ({ page }) => {
  await login(page)

  const original = uniqueName('kebab')
  await createList(page, original)
  await expect(page.getByRole('heading', { name: original })).toBeVisible()
  await waitForSync(page)

  // Keyboard: open the trigger, arrow down to Rename, activate with Enter.
  const trigger = page.getByRole('button', { name: `Actions for ${original}` })
  await trigger.focus()
  await trigger.press('Enter')
  await expect(page.getByRole('menuitem', { name: 'Rename' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeHidden()

  const renamed = uniqueName('renamed')
  await renameList(page, original, renamed)
  await expect(page.getByRole('heading', { name: renamed })).toBeVisible()
  await expect(
    page.getByRole('button', { name: renamed, exact: true }),
  ).toBeVisible()
  await waitForSync(page)

  await openListMenu(page, renamed)
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await page.getByRole('button', { name: 'Delete list' }).click()
  await expect(
    page.getByRole('button', { name: renamed, exact: true }),
  ).toBeHidden()
})

// docs/specs/lists.md — colours: the nav row's dot carries the list's
// colour. Assigning one via the palette must survive a reload, which is
// what proves it reached the server rather than only the local cache.
test('a list colour persists across a reload', async ({ page }) => {
  await login(page)

  const listName = uniqueName('coloured')
  await createList(page, listName)
  await waitForSync(page)

  // A palette swatch rather than a typed hex: the hex field's parsing is
  // already unit-tested, and duplicating it here would test the same
  // behaviour at two layers.
  await openListMenu(page, listName)
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  await page.getByRole('button', { name: 'Blue' }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  // The dot is aria-hidden (decorative — the row's name is the label), so
  // it's reached through the row rather than by role. Playwright reports
  // computed colours as rgb(), never as the source hex #4A6F96.
  const dot = page
    .getByRole('button', { name: listName, exact: true })
    .locator('span[aria-hidden="true"]')
  await expect(dot).toHaveCSS('background-color', 'rgb(74, 111, 150)')

  // Reload from the *server*, not the local cache. `waitForSync` proves the
  // colour reached the server, but the query cache is persisted to IndexedDB
  // and restored on reload with `staleTime: 30_000` (offline-first, by
  // design — docs/specs/sync-and-offline.md), so a plain reload can re-render
  // the pre-mutation snapshot without refetching. Dropping the persisted
  // cache first is what makes this assertion about the server rather than
  // about IndexedDB.
  await waitForSync(page)
  await page.evaluate(
    async () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase('keyval-store')
        req.addEventListener('success', () => resolve())
        req.addEventListener('error', () => reject(req.error))
        req.addEventListener('blocked', () => resolve())
      }),
  )
  await page.reload()
  await expect(dot).toHaveCSS('background-color', 'rgb(74, 111, 150)')
})
