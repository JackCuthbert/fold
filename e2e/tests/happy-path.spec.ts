import { expect, test } from '@playwright/test'
import { addTodo, createList, login, uniqueName, waitForSync } from './helpers'

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
