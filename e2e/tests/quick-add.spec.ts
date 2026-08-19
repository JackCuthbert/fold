import { expect, test, type Locator, type Page } from '@playwright/test'
import { createList, login, uniqueName, waitForSync } from './helpers'

/**
 * docs/specs/quick-add.md — one line of text creates a todo.
 *
 * **What this covers, and what it deliberately does not.** The grammar
 * itself is a pure function with 30-odd unit tests against a fixed
 * reference date (todos/lib/quick-add.test.ts), and re-enumerating those
 * cases here would be slow, duplicated, and — because these run against
 * *today* — unable to pin a date at all. So this asserts the things only
 * an end-to-end test can: that typing reaches the parser, that the parse
 * reaches CalDAV, that the pills are wired to the text, and that the modal
 * is actually *styled*.
 *
 * That last one is why this file exists. A stylesheet rewrite deleted eight
 * classes while every call site kept referencing them; a CSS Modules lookup
 * for a missing class returns `undefined` and `cx` drops it silently, so
 * typecheck, lint, knip and 691 unit tests were all green while the list
 * dropdown rendered as unstyled text and the keyboard popover painted
 * *behind* the modal. Nothing in the repo could catch that but a browser.
 * *(added 2026-08-14, after exactly that shipped.)*
 *
 * Its own file rather than an addition to happy-path: this opens menus and
 * popovers, and Playwright shares one browser context across a file — the
 * same coupling that had to be untangled for priority-ink.spec.ts.
 */

/** The quick add modal. */
const modal = (page: Page) => page.getByRole('dialog', { name: 'Add a todo' })

/** Its one text field. */
const field = (page: Page) => page.getByRole('textbox', { name: 'Add a todo' })

/**
 * Assert the field's text.
 *
 * `toHaveValue` does not work here: the field is a contenteditable, not a
 * form control, so it has no `value` — Playwright fails with "Not an input
 * element". Its text is real text nodes, which is also why the marks can be
 * padded (docs/specs/quick-add.md). *(changed 2026-08-19.)*
 */
async function expectFieldText(
  page: Page,
  expected: string | RegExp,
): Promise<void> {
  await expect
    .poll(async () => (await field(page).textContent()) ?? '')
    .toEqual(
      typeof expected === 'string' ? expected : expect.stringMatching(expected),
    )
}

/**
 * A menu pill — list or priority — by its accessible name.
 *
 * Named rather than matched on visible text, because a *set* pill shows
 * only its value ("Chores"), which does not say which control it is. The
 * `aria-label` carries that, so this is also the assertion that the pill is
 * announced usefully.
 */
const pill = (page: Page, name: RegExp) =>
  modal(page).getByRole('button', { name })

/**
 * A date or time pill.
 *
 * These are native inputs stretched invisibly across the pill, so the
 * platform's own picker opens on a tap — which makes them textboxes rather
 * than buttons, and reachable only by their label.
 */
const picker = (page: Page, name: RegExp) =>
  modal(page).getByRole('textbox', { name })

/** Open the modal from the nav, wherever the test happens to be. */
async function openQuickAdd(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^New todo/ }).click()
  await expect(modal(page)).toBeVisible()
}

// The parse reaching CalDAV is the whole feature: everything else is
// presentation over it.
test('one line of text becomes a todo with all four fields', async ({
  page,
}) => {
  await login(page)
  const list = uniqueName('quick')
  await createList(page, list)
  await page
    .getByRole('navigation', { name: 'Lists' })
    .getByRole('button', { name: list, exact: true })
    .first()
    .click()

  await openQuickAdd(page)
  // No `#list` token: the list on screen is inherited, which is the common
  // case and the one that makes this fast.
  await field(page).fill('Clean the gutters tomorrow at 3pm p1')

  // The preview says what was understood *before* submitting — that is the
  // contract the pills exist to keep.
  await expect(picker(page, /^Change the date$/)).toBeVisible()
  await expect(pill(page, /^Priority: High/)).toBeVisible()
  await expect(pill(page, new RegExp(`^List: ${list}`))).toBeVisible()

  await page.keyboard.press('Enter')
  await expect(modal(page)).toBeHidden()
  await waitForSync(page)

  // The tokens are gone from the summary and have become fields. Matched
  // exactly: "Clean the gutters tomorrow…" would also contain the summary,
  // so a substring match would pass on a parser that stripped nothing.
  await expect(
    page.getByText('Clean the gutters', { exact: true }),
  ).toBeVisible()
  const row = page
    .locator('main li')
    .filter({ hasText: 'Clean the gutters' })
    .first()
  // Case-insensitively: the pill is capitalised by CSS
  // (todo-meta.module.css — `text-transform`), so the DOM text is the
  // lowercase union value. Asserting "High" would test the stylesheet.
  await expect(row).toContainText(/high/i)
  // The time, not just the date — `at 3pm` is what makes this a timed due
  // rather than an all-day one (docs/specs/todos.md — due times).
  await expect(row).toContainText(/3:00\s*PM|15:00/i)
})

// The reassurance the help modal leads with: the grammar is optional, and
// ordinary prose must survive it intact. A parser that turned "chapter 3"
// into the 3rd would be worse than no parser.
test('a plain line makes a plain todo', async ({ page }) => {
  await login(page)
  const list = uniqueName('plain')
  await createList(page, list)
  await page
    .getByRole('navigation', { name: 'Lists' })
    .getByRole('button', { name: list, exact: true })
    .first()
    .click()

  await openQuickAdd(page)
  await field(page).fill('Read chapter 3')
  // Unset pills still name their categories — nothing was taken from the
  // text.
  await expect(picker(page, /^Set a date$/)).toBeVisible()
  await expect(pill(page, /^Set a priority$/)).toBeVisible()

  await page.keyboard.press('Enter')
  await expect(modal(page)).toBeHidden()
  await waitForSync(page)
  await expect(page.getByText('Read chapter 3', { exact: true })).toBeVisible()
})

// docs/specs/quick-add.md — the pills edit the text. This is the property
// that keeps one source of truth: a pill does not hold a value, it rewrites
// the line, and the parse follows from the line.
test('choosing from a pill rewrites the text', async ({ page }) => {
  await login(page)
  const first = uniqueName('alpha')
  const second = uniqueName('beta')
  await createList(page, first)
  await createList(page, second)
  await page
    .getByRole('navigation', { name: 'Lists' })
    .getByRole('button', { name: first, exact: true })
    .first()
    .click()

  await openQuickAdd(page)
  await field(page).fill('Fix the fence')

  await pill(page, new RegExp(`^List: ${first}`)).click()
  await page.getByRole('menuitem', { name: second, exact: true }).click()

  // The *text* changed — not some state beside it. The trailing space is
  // part of the contract: without it the line ends in a `#token`, which is
  // what opens the inline autocomplete, so choosing a list reopened the
  // picker over the choice just made.
  await expectFieldText(page, `Fix the fence #${second} `)
  await expect(pill(page, new RegExp(`^List: ${second}`))).toBeVisible()

  // And the menu that would have reopened is not there.
  await expect(page.getByRole('menuitem', { name: first })).toBeHidden()
})

// docs/specs/quick-add.md — ambiguity is resolved by choosing. Typing `#`
// offers the lists; Ctrl+N/P move; Enter accepts.
test('typing # offers the lists, and Ctrl+N moves through them', async ({
  page,
}) => {
  await login(page)
  const list = uniqueName('picker')
  await createList(page, list)

  await openQuickAdd(page)
  await field(page).fill('Sweep the path #')

  const options = modal(page).getByRole('button', { name: list, exact: true })
  await expect(options).toBeVisible()

  // Ctrl+N is the readline pair the spec chose, so it is what gets
  // asserted; the arrows work too and are not the interesting half.
  await page.keyboard.press('Control+n')
  await page.keyboard.press('Control+p')
  await page.keyboard.press('Enter')

  // Accepting writes the whole name and a trailing space, so typing
  // continues rather than extending the token.
  await expectFieldText(page, new RegExp(`#${list} $`))
})

// docs/specs/quick-add.md — when there is nowhere to file it. Enter used to
// move focus to the pill and say nothing, which asked the reader to infer a
// rule from a border and told a screen reader nothing at all.
test('a derived view demands a list, and says so', async ({ page }) => {
  await login(page)
  const list = uniqueName('needed')
  await createList(page, list)
  await page
    .getByRole('navigation', { name: 'Lists' })
    .getByRole('button', { name: 'Today', exact: true })
    .first()
    .click()

  await openQuickAdd(page)
  await field(page).fill('Nowhere to put this')

  // Nothing is said while typing: keyed on the text alone the pill lit up
  // on the first keystroke and stayed lit, nagging through the writing of
  // a perfectly good todo.
  await expect(modal(page).getByRole('alert')).toBeHidden()

  await page.keyboard.press('Enter')
  await expect(modal(page)).toBeVisible()
  await expect(modal(page).getByRole('alert')).toHaveText(
    'Choose a list for this todo',
  )

  // Choosing one clears it and lets the todo through.
  await pill(page, /^Choose a list$/).click()
  await page.getByRole('menuitem', { name: list, exact: true }).click()
  await expect(modal(page).getByRole('alert')).toBeHidden()
  // Submitted from the button rather than the keyboard: choosing from the
  // pill returns focus to the input, but the menu's own closing transition
  // means a keypress sent immediately can land before that happens. The
  // button is the same action and has no such race — Enter is covered by
  // the tests above, which never leave the field.
  await modal(page).getByRole('button', { name: 'Add todo' }).click()
  await expect(modal(page)).toBeHidden()
})

// docs/specs/quick-add.md — notes. The one thing the grammar does not
// cover, because prose does not belong on a line with tokens in it.
test('notes are a deliberate act, and reach the todo', async ({ page }) => {
  await login(page)
  const list = uniqueName('jotting')
  await createList(page, list)
  await page
    .getByRole('navigation', { name: 'Lists' })
    .getByRole('button', { name: list, exact: true })
    .first()
    .click()

  await openQuickAdd(page)
  await field(page).fill('Service the mower')

  // Tab reaches the button but must not fire it: adding notes is a
  // deliberate act, and Tab means "move to the next control", not "create
  // one". It used to open the field, so tabbing out of the input silently
  // added something nobody asked for.
  await field(page).press('Tab')
  await expect(modal(page).getByRole('textbox', { name: 'Notes' })).toBeHidden()

  await modal(page).getByRole('button', { name: 'Notes', exact: true }).click()
  const notes = modal(page).getByRole('textbox', { name: 'Notes' })
  await expect(notes).toBeVisible()
  // Activating it focuses the field it reveals — a layout effect, because
  // the dialog's focus trap takes focus back from anything scheduled a
  // frame later.
  await expect(notes).toBeFocused()

  await notes.fill('Check the oil level first')
  await page.keyboard.press('Enter')
  await expect(modal(page)).toBeHidden()
  await waitForSync(page)

  // The note is on the todo, not merely typed into a box.
  await expect(page.getByText('Check the oil level first')).toBeVisible()
})

/**
 * The modal's overlays are actually drawn.
 *
 * This is the regression that motivated the file. Both failures were
 * invisible to every other check: the dropdown lost its box and rendered as
 * bare text over the page behind, and the popover — in the DOM, in the
 * viewport, fully opaque — painted *behind* the modal because its
 * positioner had no z-index. Portalled layers land on `document.body`,
 * outside the modal's stacking context, so they must be lifted above
 * `--z-overlay-stacked` explicitly.
 *
 * Asserts the properties that were missing rather than exact values: a
 * palette change must not fail this, but a deleted rule must.
 */
test('the menus and the popover are styled, and sit above the modal', async ({
  page,
}) => {
  await login(page)
  const list = uniqueName('layer')
  await createList(page, list)

  await openQuickAdd(page)
  await field(page).fill('Layer check #')

  // The dropdown has a box: a ground of its own, a border and a radius.
  // Unstyled, every one of these is the initial value.
  const menu = page.locator('[role="dialog"] ul').filter({ hasText: list })
  await expect(menu).toBeVisible()
  const menuBox = await menu.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      background: style.backgroundColor,
      borderStyle: style.borderTopStyle,
      radius: style.borderTopLeftRadius,
    }
  })
  expect(menuBox.background).not.toBe('rgba(0, 0, 0, 0)')
  expect(menuBox.borderStyle).not.toBe('none')
  expect(menuBox.radius).not.toBe('0px')

  await page.keyboard.press('Escape')

  // The popover opens *over* the modal. `elementFromPoint` at its own
  // centre is the assertion that matters — being visible in the DOM told
  // us nothing, since it was visible and hidden at the same time.
  // `force`: the popup is still running its open transition, and
  // Playwright's stability check waits for a box that only settles when the
  // animation ends. The trigger is visible and hit-testable throughout.
  await modal(page)
    .getByRole('button', { name: 'Keyboard' })
    .click({ force: true })
  const popup = page.getByText('Add the todo', { exact: true })
  await expect(popup).toBeVisible()
  const onTop = await popup.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const hit = document.elementFromPoint(
      box.x + box.width / 2,
      box.y + box.height / 2,
    )
    // The popup itself, or something inside it — not the modal over it.
    return element.contains(hit) || element === hit
  })
  expect(onTop).toBe(true)
})

/**
 * The pills are set in the annotation face, as the row's own meta pills
 * are — not the reader's chosen body serif.
 *
 * Compared to a real row's pill rather than to a literal font stack: the
 * body face is a *user setting* (docs/specs/themes.md), so naming "Cabin"
 * here would test the current theme rather than the rule. What must hold is
 * that the preview of a todo and the todo it becomes are set alike.
 */
test('preview pills use the same face as the row pills', async ({ page }) => {
  await login(page)
  const list = uniqueName('face')
  await createList(page, list)
  await page
    .getByRole('navigation', { name: 'Lists' })
    .getByRole('button', { name: list, exact: true })
    .first()
    .click()

  await openQuickAdd(page)
  await field(page).fill('Face check p1')
  const previewFace = await pill(page, /^Priority: High/).evaluate(
    (element) => getComputedStyle(element).fontFamily,
  )
  await page.keyboard.press('Enter')
  await expect(modal(page)).toBeHidden()
  await waitForSync(page)

  const rowPill: Locator = page
    .locator('main li')
    .filter({ hasText: 'Face check' })
    .getByText(/^high$/i)
  await expect(rowPill).toBeVisible()
  const rowFace = await rowPill.evaluate(
    (element) => getComputedStyle(element).fontFamily,
  )

  expect(previewFace).toBe(rowFace)
  // And not the body serif, which is what it wrongly inherited.
  const bodyFace = await page.evaluate(
    () => getComputedStyle(document.body).fontFamily,
  )
  expect(previewFace).not.toBe(bodyFace)
})

// The date and time pills are native inputs stretched invisibly over a
// visible label (quick-add-modal.module.css — `.pillPickerInput`). That
// only works if the input is what the pointer actually hits: with the
// label or the chevron on top, the pill looks interactive and does
// nothing when clicked, which is what was reported.
//
// `elementFromPoint` at the label's own centre is the assertion — clicking
// and asserting a picker opened is not available, since the platform date
// picker is browser chrome Playwright cannot see.
// *(added 2026-08-15, found in use.)*
test('the whole date and time pill is the click target', async ({ page }) => {
  await login(page)
  const list = uniqueName('pills')
  await createList(page, list)
  await page
    .getByRole('navigation', { name: 'Lists' })
    .getByRole('button', { name: list, exact: true })
    .first()
    .click()

  await openQuickAdd(page)
  // A time as well as a date, so both pickers are on screen.
  await field(page).fill('Clean the gutters tomorrow at 3pm')

  for (const name of [/^Change the date$/, /^Change the time$/]) {
    const input = picker(page, name)
    await expect(input).toBeVisible()

    // Every corner and the centre of the *pill*, since the label sits at
    // the left and the chevron at the right — the two places a stray
    // element would sit. All of them must land on the input itself.
    const hits = await input.evaluate((element) => {
      const box = element.parentElement?.getBoundingClientRect()
      if (!box) throw new Error('picker input has no pill')
      const points: [string, number, number][] = [
        ['left', box.left + 4, box.top + box.height / 2],
        ['centre', box.left + box.width / 2, box.top + box.height / 2],
        ['right', box.right - 4, box.top + box.height / 2],
      ]
      return points.map(([where, x, y]) => {
        const hit = document.elementFromPoint(x, y)
        return `${where}:${hit === element ? 'input' : (hit?.tagName ?? 'none')}`
      })
    })
    expect(hits).toEqual(['left:input', 'centre:input', 'right:input'])

    // Hitting the input is necessary but not sufficient — the pill looked
    // fine by that measure while doing nothing, because opening the picker
    // was left to `::-webkit-calendar-picker-indicator`, which a `time`
    // input does not have. `showPicker` is now called explicitly, and this
    // records that it happens: the platform picker itself is browser
    // chrome Playwright cannot see, so the call is the observable part.
    // Patched on the prototype and counted on `window`, not stored on the
    // element: clicking focuses the input, React re-renders, and a stub
    // attached to the node is gone before it can be read back.
    // Stub, click, restore — all inside one evaluate, so the patch never
    // outlives the assertion. It is on the *prototype* because clicking
    // focuses the input and React re-renders it, discarding a stub set on
    // the node; and it is restored because a global left in place broke an
    // unrelated focus assertion later in this file.
    const picked = await input.evaluate((element: HTMLInputElement) => {
      const proto: { showPicker?: (() => void) | undefined } =
        HTMLInputElement.prototype
      const original = proto.showPicker
      let calls = 0
      proto.showPicker = function showPicker() {
        calls += 1
      }
      try {
        element.click()
        return calls
      } finally {
        proto.showPicker = original
      }
    })
    expect(picked).toBeGreaterThan(0)
  }
})

// A todo has one list. Typing a second `#name` used to mark and strip it
// while only the first bound — so the input showed two highlighted lists,
// the todo went to the first, and the second word vanished from the
// summary. *(added 2026-08-15, found in use.)*
test('a second list token is ordinary text', async ({ page }) => {
  await login(page)
  const first = uniqueName('one')
  const second = uniqueName('two')
  await createList(page, first)
  await createList(page, second)

  await openQuickAdd(page)
  // The second token is not last: a line *ending* in `#name` opens the
  // inline autocomplete, where Enter picks a suggestion rather than
  // submitting (activeListQuery). That is deliberate, and would make this
  // test about the picker instead.
  await field(page).fill(`Buy milk #${first} #${second} today`)

  // One list pill, naming the first.
  await expect(pill(page, new RegExp(`^List: ${first}`))).toBeVisible()
  await expect(pill(page, new RegExp(`^List: ${second}`))).toBeHidden()

  await page.keyboard.press('Enter')
  await expect(modal(page)).toBeHidden()
  await waitForSync(page)

  // The second token survives as text rather than being silently eaten.
  await expect(
    page.getByText(`Buy milk #${second}`, { exact: true }),
  ).toBeVisible()
})

// docs/specs/quick-add.md — the field wraps, and grows.
//
// The regression this exists to prevent: the field was one line that
// scrolled sideways, so a long todo pushed its own beginning out of view
// with no scrollbar to say so and no way back but walking the caret. The
// pills made it acute, because choosing a list *lengthens the text* — the
// words vanished without a keystroke.
//
// Asserted on geometry rather than on a class name: what matters is that
// the text is on screen and the buttons are reachable, which is true or
// false regardless of how the CSS achieves it.
test('a long todo wraps instead of scrolling out of sight', async ({
  page,
}) => {
  await login(page)
  const list = uniqueName('wrap')
  await createList(page, list)
  await openQuickAdd(page)

  // The `#list` token is deliberately *not* last: a line ending in
  // `#name` opens the inline autocomplete, where Enter picks a suggestion
  // rather than submitting. Same trap the second-token test documents.
  const long =
    `Clean the front gutters and downpipes #${list} before the rain ` +
    'properly sets in and the leaves block the whole lot again'
  await field(page).fill(long)

  const box = field(page)
  // Taller than a single line: the text wrapped rather than running off
  // the side. The exact line count depends on the viewport, so this asks
  // only that it grew.
  const height = await box.evaluate((el) => el.getBoundingClientRect().height)
  const lineHeight = await box.evaluate((el) =>
    parseFloat(getComputedStyle(el).lineHeight),
  )
  expect(height).toBeGreaterThan(lineHeight * 1.5)

  // Nothing is clipped horizontally — the failure mode being fixed.
  const overflow = await box.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }))
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)

  // The first word is still visible, not scrolled away to the left.
  await expect(box).toContainText('Clean the front gutters')

  // And the buttons the modal exists to reach are still on screen.
  const submit = modal(page).getByRole('button', { name: 'Add todo' })
  await expect(submit).toBeInViewport()

  // The whole line still submits and round-trips.
  await page.keyboard.press('Enter')
  await expect(modal(page)).toBeHidden()
  await waitForSync(page)
  await expect(
    page.getByText(/Clean the front gutters and downpipes/),
  ).toBeVisible()
})

// Enter submits from a wrapped line rather than adding another line to it.
// A contenteditable inserts a break on Enter by default, so this is the
// assertion that it does not: a todo summary is one line of text that
// happens to be drawn on several.
test('Enter submits a wrapped line rather than breaking it', async ({
  page,
}) => {
  await login(page)
  const list = uniqueName('nobreak')
  await createList(page, list)
  await openQuickAdd(page)

  const line =
    `Ring the plumber about the tap #${list} that has been dripping ` +
    'since the weekend'
  await field(page).fill(line)

  // Shift+Enter belongs to the notes field: it must not put a newline in
  // the summary, and it must not submit. Both were wrong — the Enter
  // branch did not check `shiftKey`, so this submitted the todo, which
  // the old `<input>` hid by clearing as the modal closed.
  await page.keyboard.press('Shift+Enter')
  await expect(modal(page)).toBeVisible()
  await expectFieldText(page, line)

  await page.keyboard.press('Enter')
  await expect(modal(page)).toBeHidden()
  await waitForSync(page)

  // One todo, its summary intact and on one logical line.
  await expect(
    page.getByText('Ring the plumber about the tap that has been dripping'),
  ).toBeVisible()
})

// docs/specs/quick-add.md — the marks. Three bugs reported together from
// use on 2026-08-19, all of them consequences of the browser editing
// inside the mark spans rather than around them.
test('a mark does not swallow what is typed after it', async ({ page }) => {
  await login(page)
  const list = uniqueName('mark')
  await createList(page, list)
  await openQuickAdd(page)

  // Type the priority token, then keep typing from the end of the line —
  // which is the trailing edge of that token's mark. The browser extends
  // the span it is editing, so without a redraw the mark grows to cover
  // everything after it: "p2" became "p2 askdjnfas asdf ask".
  await field(page).pressSequentially(`Create a thing #${list} p2`)
  await field(page).pressSequentially(' askdjnfas asdf ask')

  const marks = modal(page).locator('[role="textbox"] span')
  await expect(marks).toHaveCount(2)
  await expect(marks.nth(0)).toHaveText(`#${list}`)
  await expect(marks.nth(1)).toHaveText('p2')
})

// Choosing from the `#` autocomplete leaves the caret after the name, so
// typing carries on from there. The `<input>` kept the caret at the end of
// its value on its own; a contenteditable is redrawn around the new token,
// which stranded it wherever it had been.
test('accepting a list suggestion puts the caret after it', async ({
  page,
}) => {
  await login(page)
  const list = uniqueName('caret')
  await createList(page, list)
  await openQuickAdd(page)

  await field(page).pressSequentially(`Do a thing #${list.slice(0, 6)}`)
  // Scoped to the autocomplete: the list pill carries the same name once a
  // list is chosen, so a modal-wide lookup matches two buttons.
  await expect(
    modal(page).locator('ul[class*="inlineMenu"]').getByRole('button', {
      name: list,
    }),
  ).toBeVisible()
  await page.keyboard.press('Enter')

  // Typing continues from the end rather than from where the caret was.
  await field(page).pressSequentially('after')
  await expectFieldText(page, `Do a thing #${list} after`)
})

// The autocomplete hangs off the token being typed, so it has no business
// being on screen when the field does not hold focus — it used to sit over
// the pills and the buttons after a click elsewhere.
test('the list autocomplete closes when the field loses focus', async ({
  page,
}) => {
  await login(page)
  const list = uniqueName('blur')
  await createList(page, list)
  await openQuickAdd(page)

  await field(page).pressSequentially('Thing #')
  const menu = modal(page).locator('ul[class*="inlineMenu"]')
  await expect(menu).toBeVisible()

  // Focus a real control elsewhere in the modal.
  await modal(page).getByRole('button', { name: 'Cancel' }).focus()
  await expect(menu).toBeHidden()
})
