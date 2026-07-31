import { expect, test } from '@playwright/test'
import { addTodo, createList, login, uniqueName } from './helpers'

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

  await page.getByRole('checkbox', { name: 'Mark "Buy milk" done' }).click()
  await expect(
    page.getByRole('button', { name: 'Completed (1)' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Completed (1)' }).click()
  await page.getByRole('button', { name: 'Clear completed' }).click()
  await page.getByRole('button', { name: 'Delete 1' }).click()
  await expect(page.getByText('Buy milk')).toBeHidden()
  await expect(page.getByText('Buy bread')).toBeVisible()

  // Survives a reload — it's really on the server.
  await page.reload()
  await expect(page.getByText('Buy bread')).toBeVisible()
})
