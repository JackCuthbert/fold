import type { Page } from '@playwright/test'

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

export async function addTodo(page: Page, summary: string): Promise<void> {
  const input = page.getByLabel('Add a todo')
  await input.fill(summary)
  await input.press('Enter')
}
