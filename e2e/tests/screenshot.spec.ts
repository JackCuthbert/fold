import { expect, test, type Page } from '@playwright/test'
import { setDueDate } from '../helpers/due'
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
 * Set the Due field `days` from now. **Negative is in the past**, which is
 * how the fixture gets an overdue row — `setDate` rolls the month and year
 * backwards as readily as forwards, and the field takes any valid date.
 * *(negative offsets first used 2026-08-14.)*
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
  await setDueDate(page, value)
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
 *
 * **It runs against the fake CalDAV gateway** since #56 moved the
 * `screenshot` project to :3301 (docs/specs/testing.md — two modes). The
 * image is of the *client*, and seeded state renders identically whichever
 * gateway produced it.
 *
 * It still builds its fixture by **driving the UI** rather than through
 * `seedLists`, and that is worth a note now the faster path exists.
 * `seedLists` would be quicker and is the right tool for a spec that needs
 * arrangement it is not testing. Here the arrangement is not incidental:
 * this file is the one place the app's own create-list-with-a-colour and
 * set-a-due-date flows are exercised end to end at all, and a picture
 * generated from data the UI never touched could look perfect while those
 * flows were broken. The cost is ~20s of round trips against an in-memory
 * fake, once, when someone regenerates an image by hand.
 *
 * If this ever becomes slow enough to matter, seed the bulk and drive the
 * UI for the handful of rows actually on camera.
 * *(noted 2026-08-14.)*
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
 * `due` is relative so the image never shows a date that has quietly gone
 * stale: 0 is today, negative is overdue; `priority` matches the picker's
 * own labels.
 *
 * **Balanced for the Today view**, which is what the screenshot now lands
 * on *(changed 2026-08-14: was the Home list)*. Today is
 * overdue-and-due-today across every list (docs/specs/today-view.md), so
 * what it photographs depends entirely on how much of this fixture is due
 * today — and the old data had almost nothing, which would have produced a
 * near-empty frame. Four things are deliberate:
 *
 * - **Several lists have work due today**, because a derived view gathering
 *   from one list looks identical to a list and makes the point of the view
 *   invisible. Five of the seven contribute.
 * - **One overdue todo** ("Chase the plumber", due -2), so the overdue row
 *   treatment appears. Exactly one: overdue is a state worth showing, not
 *   the impression of an account being drowned.
 * - **Two health todos due today**, so the Health section leads with its
 *   heading and "Everything else" appears beneath it
 *   (docs/specs/list-kinds.md).
 * - **A Groceries list with four todos due today**, which collapse into one
 *   "Groceries · 4 todos" row with a carrot — grouping is the least
 *   guessable behaviour in the app and this is the only place it can be
 *   shown.
 *
 * The rest keeps its later dates on purpose. Not everything is due today in
 * a real account, and a fixture where it were would be exactly the evenly
 * sprinkled data this comment has always argued against.
 */
const LISTS = [
  {
    name: 'Home',
    colour: 'Orange',
    todos: [
      // The featured todo (see FEATURED): carries a due date, a note and a
      // priority so the open panel shows every field doing something. Due
      // *today* since 2026-08-14 — the panel is opened from Today, so a
      // todo due in two days would not be on screen to click.
      {
        summary: 'Replace the kitchen tap washer',
        due: 0,
        priority: 'Medium',
        note: '15mm ceramic. The hardware shop on Beach Rd has them.',
      },
      // The one overdue row, so the overdue treatment is visible. Its
      // instant is in the past, so it sorts to the top of "Everything
      // else" (docs/specs/today-view.md — ordering).
      { summary: 'Chase the plumber', due: -2, priority: 'High' },
      { summary: 'Book the car in for a service', due: 9 },
      { summary: 'Take the recycling out', due: 8 },
      { summary: 'Ring the landlord about the gutter', priority: 'High' },
      { summary: 'Sort out the shed', priority: 'Low' },
      // Finished today, so it lands in Today's Completed section — which
      // is expanded by default there (docs/specs/today-view.md), unlike a
      // list view. Enough of it across the lists that the section fills the
      // lower frame rather than trailing off into blank space.
      { summary: 'Water the herbs', done: true },
      { summary: 'Pay the water bill', done: true },
      { summary: 'Take the op-shop bags in', done: true },
    ],
  },
  {
    name: 'Work',
    colour: 'Blue',
    todos: [
      { summary: 'Send the sprint summary', due: 0, priority: 'High' },
      // Deliberately *not* due today: the active half of Today fills the
      // frame long before the Completed section gets any of it, and every
      // extra due-today row pushes finished work off the bottom edge. Two
      // Work items due today was one too many.
      // *(changed 2026-08-14: was due 0.)*
      { summary: 'Review the on-call rota', due: 4 },
      { summary: 'Write up the migration notes', due: 3, priority: 'High' },
      { summary: 'Book leave for August', priority: 'Low' },
      { summary: 'Send the invoice', done: true },
    ],
  },
  {
    // Also a recognised kind, and the one whose behaviour is least
    // guessable from the nav alone — its todos lead the derived views
    // (docs/specs/list-kinds.md). Present so the screenshot's nav shows
    // more than one sparkled list, which is what makes the mark read as a
    // category rather than a one-off. *(added 2026-08-05.)*
    //
    // Both due today since 2026-08-14, so Today opens with the Health
    // heading above everything else — the behaviour this kind exists for,
    // and one a still image can actually show. Neither row carries a heart:
    // inside the section the heading already names the category
    // (docs/specs/list-kinds.md — a heart, but only where there is no
    // heading).
    name: 'Health',
    colour: 'Rose',
    todos: [
      { summary: 'Refill the prescription', due: 0, priority: 'Medium' },
      { summary: 'Physio exercises', due: 0 },
      { summary: 'Book the dentist', due: 12 },
    ],
  },
  {
    // A grocery list, which is the only kind whose *grouping* a screenshot
    // can show: its four todos due today collapse into a single
    // "Groceries · 4 todos" row carrying a carrot, rather than four rows of
    // shopping nobody reviewing their day wants to read
    // (docs/specs/list-kinds.md — grouping in derived views).
    //
    // Added 2026-08-14 with the move to Today. It is also the third
    // sparkled list in the nav, which is what makes the mark read as a
    // category rather than a coincidence.
    name: 'Groceries',
    colour: 'Amber',
    todos: [
      { summary: 'Oat milk', due: 0 },
      { summary: 'Sourdough', due: 0 },
      { summary: 'Coffee beans', due: 0 },
      { summary: 'Lemons', due: 0 },
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
      { summary: 'Water the seedlings', due: 0 },
      { summary: 'Plant out the tomatoes', due: 6 },
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
// date and a priority, so every field in the panel is doing something.
//
// It must be **due today**, or it is not in the Today view and there is
// nothing to click. That is the constraint the move to Today added: this
// todo was due in 2 days and simply would not have been on screen.
// *(changed 2026-08-14: was due 2.)*
const FEATURED = 'Replace the kitchen tap washer'

// The row whose context menu is opened for the shot. Below the featured
// one, so the menu opens downward into empty space instead of over the
// todo the detail panel is showing. *(added 2026-08-11, issue #40.)*
//
// Re-derived against Today's own ordering rather than creation order
// *(changed 2026-08-14: was "Ring the landlord about the gutter", which
// has no due date and so is not in Today at all)*. Today sorts by due
// instant (docs/specs/today-view.md — ordering), and every due-today todo
// ties there, so the order falls back to `sortActiveTodos`' stable one —
// which preserves the order the lists are created in above. Garden is the
// last list with work due today, so this is the final active row.
//
// **The last row specifically**, which took two attempts. Anchored on a
// row in the middle of the view, the menu and its submenu opened straight
// across the collapsed "Groceries · 4 todos" row — obscuring the single
// most distinctive thing in the frame, since grouping is the behaviour no
// other screenshot can show. Anchoring on the last active row opens both
// popups over the gap above Completed instead.
// Asserted at the point of use rather than assumed.
// *(changed 2026-08-14: was "Take the recycling out", mid-list.)*
const MENU_ROW = 'Water the seedlings'

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

  // Land on **Today**, not a list *(changed 2026-08-14)*. A plain list of
  // todos looks like any todo app; Today is where what makes Fold itself
  // is visible in one frame — a derived view gathering from every list,
  // the Health section leading, a grocery list collapsed into one row, and
  // an overdue todo still being chased.
  await page.getByRole('button', { name: 'Today', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()

  // **No click to expand Completed here.** In a list view it starts
  // collapsed and the old version of this file clicked it open; in Today
  // it is expanded by default, because the section is one day's finished
  // work rather than an ever-growing archive (docs/specs/today-view.md).
  // Clicking would therefore *close* it — the exact inverse of what the
  // line was for. Asserted rather than assumed, since it is the sort of
  // thing that would silently regress into an empty lower frame.
  // *(changed 2026-08-14.)*
  await expect(
    page.getByRole('button', { name: /^Completed \(\d+\)$/ }),
  ).toBeVisible()
  await expect(page.getByText('Water the herbs', { exact: true })).toBeVisible()

  // The three list-kind behaviours this view exists to show, checked
  // before the shot rather than discovered missing in the committed PNG.
  // The Health heading leads, "Everything else" follows it, and the
  // grocery list is one collapsed row.
  // Scoped to the content column: "Health" is also a list name in the nav.
  const content = page.locator('main')
  await expect(
    content.getByRole('heading', { name: 'Health', exact: true }),
  ).toBeVisible()
  await expect(content.getByText('Everything else')).toBeVisible()
  // The collapsed grocery row, by its accessible name — which carries the
  // count, so this also asserts all four todos are behind one row rather
  // than drawn separately. Matched this way because a plain "Groceries"
  // text query also finds the list's own nav row.
  await expect(
    page.getByRole('button', { name: 'Groceries 4 todos' }),
  ).toBeVisible()

  await openDetail(page, FEATURED)

  // Nothing mid-flight in the picture: no sync pill, no focus ring on
  // whatever was last clicked.
  await waitForSync(page)
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
  })

  // Open a row's context menu, and rest the pointer on a priority choice
  // (docs/specs/todos.md — row actions). Right-click is invisible until
  // you try it: there is no affordance that can advertise it, so a
  // screenshot is the one place it can be shown at all.
  //
  // On a row *below* the featured one, so the menu opens into empty space
  // rather than over the todo whose detail panel is the other half of the
  // picture. The pointer lands on the label's right-hand end for the same
  // reason — a menu anchored at the summary's first character would cover
  // the text it belongs to.
  //
  // This replaced hovering Today's *nav row* to reveal its keyboard chord:
  // only one element can be hovered per frame, and the menu says more
  // about the app than a shortcut hint the help modal also lists. That
  // trade still holds now the shot is taken *in* the Today view — the
  // chord hint would be a small annotation on a nav row, against a menu
  // that shows an interaction with no other affordance.
  // *(changed 2026-08-11, issue #40; re-checked 2026-08-14 on the move to
  // Today.)*
  const menuRow = page.getByText(MENU_ROW, { exact: true })
  const box = await menuRow.boundingBox()
  if (!box) throw new Error(`no bounding box for ${MENU_ROW}`)
  // The "below the featured one" property, asserted rather than assumed:
  // it depends on Today's due-instant ordering and on a stable tie-break
  // between two todos due the same day, neither of which is obvious from
  // reading the fixture. If it ever flips, the menu opens over the detail
  // panel and the picture is wrong in a way nobody would notice.
  // *(added 2026-08-14.)*
  const featuredBox = await page
    .getByText(FEATURED, { exact: true })
    .boundingBox()
  if (!featuredBox) throw new Error(`no bounding box for ${FEATURED}`)
  expect(box.y).toBeGreaterThan(featuredBox.y)
  // Base UI anchors the menu at the pointer, so where this clicks decides
  // where two popups land. Just past the label's end: on the text, the
  // menu covered the last word of the summary it belongs to; much further
  // right, the submenu opened across the detail panel's notes field. This
  // clears the summary and still leaves room for both popups.
  await menuRow.click({
    button: 'right',
    position: { x: box.width + 8, y: box.height / 2 },
  })
  await expect(page.getByRole('menu').first()).toBeVisible()
  await page.getByRole('menuitem', { name: /^Priority/ }).hover()
  await expect(page.getByRole('menu')).toHaveCount(2)
  await page.getByRole('menuitemradio', { name: 'High' }).hover()

  // Let any open/settle transition finish (docs/specs/ui.md — overlays
  // animate). Fixed rather than polled: there is no state change to wait
  // on, only paint.
  await page.waitForTimeout(500)

  await page.screenshot({ path: '../docs/screenshot.png' })
})
