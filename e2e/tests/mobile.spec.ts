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
