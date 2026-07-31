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

test('login → create list → add → complete → clear completed', async ({
  page,
}) => {
  await login(page)

  const listName = uniqueName('groceries')
  await createList(page, listName)
  await expect(page.getByRole('heading', { name: listName })).toBeVisible()

  await addTodo(page, 'Buy milk')
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

  await page.getByRole('button', { name: 'Completed (1)' }).click()
  await page.getByRole('button', { name: 'Clear completed' }).click()
  await page.getByRole('button', { name: 'Delete 1' }).click()
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
