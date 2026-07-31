import { expect, test } from '@playwright/test'
import { addTodo, createList, login, uniqueName, waitForSync } from './helpers'

test('offline actions queue and replay on reconnect', async ({
  page,
  context,
}) => {
  await login(page)
  const listName = uniqueName('offline')
  await createList(page, listName)
  await addTodo(page, 'Synced before outage')
  await expect(page.getByText('Synced before outage')).toBeVisible()
  // Let the create round-trip before going offline — matches what a real
  // user experiences and avoids racing the outbox's own retry of an
  // in-flight request against the offline toggle.
  await waitForSync(page)

  await context.setOffline(true)

  await addTodo(page, 'Written while offline')
  await page
    .getByRole('checkbox', { name: 'Mark "Synced before outage" done' })
    .click()
  await expect(page.getByText('Written while offline')).toBeVisible()
  await expect(page.getByText(/Offline · \d+ queued/)).toBeVisible()

  await context.setOffline(false)
  await expect(page.getByText(/Offline/)).toBeHidden({ timeout: 15_000 })
  await waitForSync(page)

  // Reload proves the changes reached the server, not just the cache.
  await page.reload()
  await expect(page.getByText('Written while offline')).toBeVisible()
  await page.getByRole('button', { name: 'Completed (1)' }).click()
  await expect(page.getByText('Synced before outage')).toBeVisible()
})
