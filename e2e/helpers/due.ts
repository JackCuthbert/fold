import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Helpers for the due date controls (docs/specs/todos.md — due times).
 *
 * The date and time are behind switches rather than always-present
 * pickers: a "Date" switch reveals the date field, and a nested "Time"
 * switch reveals the time field. Setting a date is therefore two steps, not one, and
 * every spec that used to `fill()` a "Due" input needs the switch first.
 * Centralised here so the next change to that interaction is one edit
 * rather than ten. *(added 2026-08-08.)*
 */

/** The "Date" switch — present whenever the list allows due dates. */
export const dueDateSwitch = (page: Page): Locator =>
  page.getByRole('switch', { name: 'Date', exact: true })

/**
 * The date picker itself. Only rendered once the switch is on.
 *
 * Matched by role, not `getByLabel`: the switch and the input it reveals
 * deliberately share one label ("Date"), so a label lookup is ambiguous.
 */
export const dueDateInput = (page: Page): Locator =>
  page.getByRole('textbox', { name: 'Date', exact: true })

/**
 * Turn on the due date and set it, in whichever form is open.
 *
 * Turning the switch on seeds today, so the `fill` overwrites a real value
 * rather than an empty field — which is also why this waits for the input
 * before filling: the picker mounts in response to the switch.
 */
export async function setDueDate(page: Page, value: string): Promise<void> {
  const toggle = dueDateSwitch(page)
  if ((await toggle.getAttribute('aria-checked')) !== 'true') {
    await toggle.click()
  }
  const input = dueDateInput(page)
  await expect(input).toBeVisible()
  await input.fill(value)
}

/** Turn the due date off entirely — the "no date" case. */
export async function clearDueDate(page: Page): Promise<void> {
  const toggle = dueDateSwitch(page)
  if ((await toggle.getAttribute('aria-checked')) === 'true') {
    await toggle.click()
  }
  await expect(dueDateInput(page)).toBeHidden()
}
