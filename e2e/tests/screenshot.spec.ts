import { expect, test, type Page } from '@playwright/test'
import { addTodo, login, waitForSync } from './helpers'

/**
 * Create a list *with* a colour.
 *
 * Local rather than in helpers.ts: no behavioural test needs this — they
 * create plain lists — and only the screenshot cares that the nav shows
 * colour. The picker is part of the create modal, so this is one dialog,
 * not a create followed by an edit.
 */
async function createColouredList(
  page: Page,
  name: string,
  colour: string,
): Promise<void> {
  await page.getByRole('button', { name: '+ New list' }).click()
  await page.getByPlaceholder('List name').fill(name)
  // Swatches are labelled by the palette's colour names
  // (lists/color-picker.tsx).
  await page.getByRole('button', { name: colour, exact: true }).click()
  await page.getByRole('button', { name: 'Create', exact: true }).click()
}

/** Open a todo's detail panel and wait for it to be ready to fill in. */
async function openDetail(page: Page, summary: string): Promise<void> {
  await page.getByText(summary, { exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Edit todo' })).toBeVisible()
}

/**
 * Set the Due field `days` from now.
 *
 * Relative so the screenshot never shows a date that has quietly gone
 * stale — regenerating it next year should still look like a live account.
 * Built from local date parts rather than `toISOString()`, which converts
 * to UTC first and lands on the wrong day either side of midnight.
 */
async function setDue(page: Page, days: number): Promise<void> {
  const date = new Date()
  date.setDate(date.getDate() + days)
  const value = [
    String(date.getFullYear()),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
  await page.getByLabel('Due', { exact: true }).fill(value)
}

/**
 * Regenerates the README screenshot. Run it with:
 *
 *   bun run screenshot
 *
 * **Not a test** — it asserts only enough to know the app is in the state
 * being photographed, and it writes a file the repo tracks. It is excluded
 * from `bun run test:e2e` (see playwright.config.ts) so a normal e2e run
 * never rewrites a committed image.
 *
 * It exists because a README screenshot rots silently: the UI moves, the
 * picture doesn't, and nobody notices until it misrepresents the app. This
 * makes refreshing it one command against real data from a real CalDAV
 * server rather than a manual crop someone has to remember how to reproduce.
 *
 * **Keep it current.** Re-run it whenever a change lands that is visible
 * here — layout, nav, the detail panel, colours, type — and commit the
 * result alongside that change (CLAUDE.md).
 *
 * *(added 2026-08-04.)*
 */

/**
 * An account that looks *lived in*, which is the whole job of this
 * picture: someone who has been using Fold for months, not someone who
 * installed it ten minutes ago. That means several lists covering
 * different parts of a life, uneven todo counts, some work already
 * finished, and due dates and priorities used where they'd naturally be
 * used rather than sprinkled evenly.
 *
 * Colours are the palette's own names (lists/color-picker.tsx), picked
 * through the picker rather than typed as hex, so the screenshot shows
 * colours a user can actually choose.
 *
 * `dueInDays` is relative so the image never shows a date that has quietly
 * gone stale; `priority` matches the picker's own labels.
 */
const LISTS = [
  {
    name: 'Home',
    colour: 'Orange',
    todos: [
      // The featured todo (see FEATURED): carries a due date, a note and a
      // priority so the open panel shows every field doing something.
      {
        summary: 'Replace the kitchen tap washer',
        due: 2,
        priority: 'Medium',
        note: '15mm ceramic. The hardware shop on Beach Rd has them.',
      },
      { summary: 'Book the car in for a service', due: 9 },
      { summary: 'Ring the landlord about the gutter', priority: 'High' },
      { summary: 'Take the recycling out', due: 1 },
      { summary: 'Sort out the shed', priority: 'Low' },
      // Enough finished work that the expanded Completed section fills the
      // lower half of the frame rather than trailing off into blank space.
      { summary: 'Water the herbs', done: true },
      { summary: 'Pay the water bill', done: true },
      { summary: 'Fix the back gate latch', done: true },
      { summary: 'Take the op-shop bags in', done: true },
      { summary: 'Descale the kettle', done: true },
    ],
  },
  {
    name: 'Work',
    colour: 'Blue',
    todos: [
      { summary: 'Write up the migration notes', due: 3, priority: 'High' },
      { summary: 'Review the on-call rota', due: 5 },
      { summary: 'Book leave for August', priority: 'Low' },
      { summary: 'Send the invoice', done: true },
    ],
  },
  {
    // A recognised list kind (docs/specs/list-kinds.md), so it carries the
    // sparkle in the nav — which is worth having in the screenshot.
    //
    // No `due` on any of these, and that is not an oversight: a media list
    // has no due-date fields at all, so setting one here would hang
    // waiting for an input that is deliberately absent. Priority is how
    // such a list says what is next. *(changed 2026-08-05.)*
    name: 'Reading',
    colour: 'Violet',
    todos: [
      { summary: 'Finish the Le Guin essays' },
      { summary: 'Return library books', priority: 'High' },
      { summary: 'Start the Graeber' },
    ],
  },
  {
    name: 'Garden',
    colour: 'Green',
    todos: [
      { summary: 'Plant out the tomato seedlings', due: 6 },
      { summary: 'Order compost' },
      { summary: 'Prune the lemon tree', done: true },
    ],
  },
  {
    name: 'Someday',
    colour: 'Teal',
    todos: [
      { summary: 'Learn to develop film properly' },
      { summary: 'Walk the Overland Track' },
    ],
  },
] as const

// The one the detail panel is opened on, so the panel photographs
// populated rather than as a column of blanks. It carries a note, a due
// date, and lives in the list the screenshot lands on.
const FEATURED = 'Replace the kitchen tap washer'

test('README screenshot', async ({ page }) => {
  // 16:10 at 2x — a shape that sits well in a README without the browser
  // chrome that a full-page capture of a narrow viewport would imply.
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page)

  for (const list of LISTS) {
    await createColouredList(page, list.name, list.colour)
    await expect(page.getByRole('heading', { name: list.name })).toBeVisible()
    for (const todo of list.todos) await addTodo(page, todo.summary)
    // Completing needs the create to have round-tripped: the PUT carries
    // the ETag the client cached, which is only the server's real one
    // once the create landed (see happy-path.spec.ts).
    await waitForSync(page)

    for (const todo of list.todos) {
      const due = 'due' in todo ? todo.due : undefined
      const priority = 'priority' in todo ? todo.priority : undefined
      const note = 'note' in todo ? todo.note : undefined
      if (due === undefined && priority === undefined && note === undefined) {
        continue
      }
      await openDetail(page, todo.summary)
      if (due !== undefined) await setDue(page, due)
      if (priority !== undefined) {
        await page.getByRole('combobox', { name: 'Priority' }).click()
        await page.getByRole('option', { name: priority }).click()
      }
      if (note !== undefined) await page.getByLabel('Notes').fill(note)
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      await waitForSync(page)
    }

    // Complete last: a completed todo locks its fields (issue #25), so
    // anything set above has to be in place before this runs.
    for (const todo of list.todos) {
      if (!('done' in todo && todo.done)) continue
      await page
        .getByRole('checkbox', { name: `Mark "${todo.summary}" done` })
        .click()
    }
    await waitForSync(page)
  }

  // Land on the list the featured todo lives in, then open it — saving
  // above closed the panel, and the panel open is the point.
  await page.getByRole('button', { name: LISTS[0].name, exact: true }).click()

  // Expand the completed section. Collapsed is the app's default (finished
  // work folds out of sight — docs/specs/todos.md), but a screenshot with
  // it shut leaves the lower half of the frame empty and says nothing
  // about where completed todos go.
  await page.getByRole('button', { name: /^Completed \(\d+\)$/ }).click()

  await openDetail(page, FEATURED)

  // Nothing mid-flight in the picture: no sync pill, no focus ring on
  // whatever was last clicked.
  await waitForSync(page)
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
  })

  // Rest the pointer on Today, so its keyboard shortcut is revealed
  // (docs/specs/ui.md — keyboard shortcuts: the chords are hidden until
  // hovered or until Ctrl is held). A screenshot of the nav at rest shows
  // no chords at all, which would say the app has none — this is the one
  // frame where a hover state is the honest one.
  // *(added 2026-08-04.)*
  await page.getByRole('button', { name: 'Today', exact: true }).hover()

  // Let any open/settle transition finish (docs/specs/ui.md — overlays
  // animate), including the hint's own fade. Fixed rather than polled:
  // there is no state change to wait on, only paint.
  await page.waitForTimeout(500)

  await page.screenshot({ path: '../docs/screenshot.png' })
})
