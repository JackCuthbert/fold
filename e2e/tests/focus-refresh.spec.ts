import { expect, test } from '@playwright/test'
import { caldavUrlFor, currentTestUser, login, seedLists } from './helpers'

test('focus and visibility restoration refresh fresh todo data', async ({
  page,
}) => {
  const user = currentTestUser()
  const listId = 'focus-refresh-list'
  const todoUid = 'focus-refresh-todo'
  await seedLists(
    page,
    [
      {
        id: listId,
        displayName: 'Focus refresh',
        todos: [{ uid: todoUid, summary: 'Original remote todo' }],
      },
    ],
    user,
  )
  await login(page, user)
  await page
    .getByRole('navigation', { name: 'Lists' })
    .getByRole('button', { name: 'Focus refresh', exact: true })
    .first()
    .click()
  await expect(
    page.getByRole('heading', { name: 'Focus refresh' }),
  ).toBeVisible()
  await page.getByText('Original remote todo', { exact: true }).click()
  const summary = page.getByRole('textbox', { name: 'Summary' })
  await summary.fill('Unsaved local edit')

  const credentials = {
    serverUrl: caldavUrlFor(user),
    username: user,
    password: 'anything',
  }
  const seedRemoteTodo = async (serverSummary: string) => {
    const response = await page.request.post('/api/testing/fake', {
      data: {
        credentials,
        reset: true,
        lists: [
          {
            id: listId,
            displayName: 'Focus refresh',
            todos: [{ uid: todoUid, summary: serverSummary }],
          },
        ],
      },
    })
    expect(response.ok()).toBe(true)
  }

  await seedRemoteTodo('First remote update')
  const firstRefresh = page.waitForRequest((request) =>
    request.url().includes(`/api/lists/${listId}/todos`),
  )
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await firstRefresh
  await expect(page.getByText('First remote update')).toBeVisible()
  await expect(summary).toHaveValue('Unsaved local edit')

  await seedRemoteTodo('Second remote update')
  const secondRefresh = page.waitForRequest((request) =>
    request.url().includes(`/api/lists/${listId}/todos`),
  )
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await secondRefresh
  await expect(page.getByText('Second remote update')).toBeVisible()
  await expect(summary).toHaveValue('Unsaved local edit')

  await seedRemoteTodo('Restored remote update')
  await page.evaluate(() => {
    let visibility: DocumentVisibilityState = 'hidden'
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    })
    window.dispatchEvent(new Event('visibilitychange'))
    visibility = 'visible'
  })
  const restoredRefresh = page.waitForRequest((request) =>
    request.url().includes(`/api/lists/${listId}/todos`),
  )
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await restoredRefresh
  await expect(page.getByText('Restored remote update')).toBeVisible()
  await expect(summary).toHaveValue('Unsaved local edit')
})
