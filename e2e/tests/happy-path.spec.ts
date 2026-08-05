import { expect, test } from '@playwright/test'
import {
  addTodo,
  createList,
  login,
  openListMenu,
  reloadFromServer,
  renameList,
  uniqueName,
  waitForSync,
} from './helpers'

test('login → create list → add → complete → delete', async ({ page }) => {
  await login(page)

  const listName = uniqueName('groceries')
  await createList(page, listName)
  await expect(page.getByRole('heading', { name: listName })).toBeVisible()

  // docs/specs/ui.md — the header: an empty list says so in words rather
  // than showing a bare zero or nothing at all. A moment of skeleton comes
  // first — the list is new, so its todos genuinely aren't known yet — so
  // this waits for the settled state rather than the first frame.
  await expect(page.getByText('No todos')).toBeVisible({ timeout: 10_000 })

  await addTodo(page, 'Buy milk')
  await expect(page.getByText('Buy milk')).toBeVisible()
  // docs/specs/ui.md — accessibility: focus must not land somewhere
  // misleading after an action. Submitting the add-todo form with Enter
  // used to leave focus on the first row's checkbox once it re-rendered,
  // which then read as focused/selected — regression coverage for that.
  // It should rest on the "Add a todo" trigger that opened the dialog.
  await expect(page.getByRole('button', { name: 'Add a todo' })).toBeFocused()
  await expect(
    page.getByRole('checkbox', { name: 'Mark "Buy milk" done' }),
  ).not.toBeFocused()

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
  // The count tracks what's *left*, so completing one moves it — and the
  // done half only appears once there is some.
  await expect(page.getByText('1 todo · 1 done')).toBeVisible()

  // docs/specs/todos.md — clearing completed todos: there is no bulk
  // delete; a completed todo is the only record that the work was done.
  // Deleting one goes through its detail sheet, one at a time.
  // *(changed 2026-08-02: was "Clear completed" + "Delete 1".)*
  // Deleting asks first: it is unrecoverable, and completing is not a
  // lesser version of it (docs/specs/todos.md — deleting a todo, issue
  // #19). A completed todo is confirmed just like an active one.
  await page.getByRole('button', { name: 'Completed (1)' }).click()
  await page.getByText('Buy milk').click()
  await page.getByRole('button', { name: 'Delete' }).click()
  const confirm = page.getByRole('alertdialog')
  await expect(confirm).toBeVisible()
  // The body names the todo, so you can see what you're about to destroy
  // (the title can't — summaries run long).
  await expect(confirm.getByText('Buy milk')).toBeVisible()

  // Cancelling keeps the todo. Checked before the destructive path, since
  // a confirm that deletes on *either* answer would still pass the
  // delete-succeeds assertion below.
  await confirm.getByRole('button', { name: 'Cancel' }).click()
  await expect(confirm).toBeHidden()
  await expect(page.getByText('Buy milk')).toBeVisible()

  await page.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('button', { name: 'Delete todo' }).click()
  await expect(page.getByText('Buy milk')).toBeHidden()
  await expect(page.getByText('Buy bread')).toBeVisible()

  // Survives a reload — it's really on the server, not just the cache.
  // Via `reloadFromServer`, so the persisted cache can't answer for the
  // server: this asserted a *deleted* todo was gone, and a restored
  // pre-delete snapshot would show it (issue #8).
  await reloadFromServer(page)
  await expect(page.getByText('Buy bread')).toBeVisible()
  await expect(page.getByText('Buy milk')).toBeHidden()
})

// docs/specs/ui.md — the nav: per-list Rename/Delete live in a kebab menu,
// keyboard navigable via Base UI's Menu, rather than inline icon buttons.
test('rename and delete a list via its kebab menu', async ({ page }) => {
  await login(page)

  const original = uniqueName('kebab')
  await createList(page, original)
  await expect(page.getByRole('heading', { name: original })).toBeVisible()
  await waitForSync(page)

  // Keyboard: open the trigger, then walk to the bottom of the menu with
  // the arrow keys. Delete is last, so End reaches it regardless of how
  // many items sit above — the menu gained "Move up"/"Move down" above
  // Rename (docs/specs/lists.md — ordering), and whether those are enabled
  // depends on where this list sorts, which isn't this test's subject.
  // *(changed 2026-08-03: asserted Rename was the first item, which the
  // reordering items displaced.)*
  const trigger = page.getByRole('button', { name: `Actions for ${original}` })
  await trigger.focus()
  await trigger.press('Enter')
  await page.keyboard.press('End')
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(page.getByRole('menuitem', { name: 'Edit' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeHidden()

  const renamed = uniqueName('renamed')
  await renameList(page, original, renamed)
  await expect(page.getByRole('heading', { name: renamed })).toBeVisible()
  await expect(
    page.getByRole('button', { name: renamed, exact: true }),
  ).toBeVisible()
  await waitForSync(page)

  await openListMenu(page, renamed)
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await page.getByRole('button', { name: 'Delete list' }).click()
  await expect(
    page.getByRole('button', { name: renamed, exact: true }),
  ).toBeHidden()
})

// docs/specs/lists.md — colours: the nav row's dot carries the list's
// colour. Assigning one via the palette must survive a reload, which is
// what proves it reached the server rather than only the local cache.
test('a list colour persists across a reload', async ({ page }) => {
  await login(page)

  const listName = uniqueName('coloured')
  await createList(page, listName)
  await waitForSync(page)

  // A palette swatch rather than a typed hex: the hex field's parsing is
  // already unit-tested, and duplicating it here would test the same
  // behaviour at two layers.
  await openListMenu(page, listName)
  await page.getByRole('menuitem', { name: 'Edit' }).click()
  await page.getByRole('button', { name: 'Blue' }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  // The dot is aria-hidden (decorative — the row's name is the label), so
  // it's reached through the row rather than by role.
  //
  // Asserted on the *painted* circle — `.dot::after` — rather than on the
  // element's own background: the dot is 8px inside a 16px footprint that
  // aligns it with the icons on every other nav row, so the colour lands
  // on a pseudo-element and the box itself is transparent. Playwright
  // can't locate a pseudo-element, hence the evaluate. Computed colours
  // come back as rgb(), never as the source hex #4A6F96.
  // *(changed 2026-08-04.)*
  const dot = page
    .getByRole('button', { name: listName, exact: true })
    .locator('span[aria-hidden="true"]')
  await expect
    .poll(() =>
      dot.evaluate((el) => getComputedStyle(el, '::after').backgroundColor),
    )
    .toBe('rgb(74, 111, 150)')

  // Reload from the *server*, not the local cache. `waitForSync` proves the
  // colour reached the server, but the query cache is persisted to IndexedDB
  // and restored on reload with `staleTime: 30_000` (offline-first, by
  // design — docs/specs/sync-and-offline.md), so a plain reload can re-render
  // the pre-mutation snapshot without refetching. Dropping the persisted
  // cache first is what makes this assertion about the server rather than
  // about IndexedDB.
  await reloadFromServer(page)
  // Same pseudo-element read as above — this is the assertion that proves
  // the colour came back from the *server*.
  await expect
    .poll(() =>
      dot.evaluate((el) => getComputedStyle(el, '::after').backgroundColor),
    )
    .toBe('rgb(74, 111, 150)')
})

// docs/specs/lists.md — ordering: the kebab's Move up/Move down are the
// only way to reorder (buttons, not drag-and-drop — keyboard-operable and
// touch-friendly for free). Surviving a reload is what proves the new
// order reached the server rather than only the local cache.
test('reordering a list survives a reload', async ({ page }) => {
  await login(page)

  // Named so that alphabetical order would put "alpha" first — the move
  // below has to beat the name tiebreak, not coincide with it.
  const first = uniqueName('alpha')
  const second = uniqueName('beta')
  await createList(page, first)
  await createList(page, second)
  await waitForSync(page)

  // Only *these two* rows, in nav order. The suite shares one Radicale, so
  // lists other tests created are also in the nav — an assertion on the
  // whole nav would depend on what else has run.
  const pairOrder = async (): Promise<string[]> =>
    (
      await page
        .getByRole('navigation', { name: 'Lists' })
        .getByRole('listitem')
        .allInnerTexts()
    )
      .map((text) => text.trim().split('\n')[0] ?? '')
      .filter((name) => name === first || name === second)

  // Created in this order, so `nextOrder` gives them ascending orders.
  await expect(async () => {
    expect(await pairOrder()).toEqual([first, second])
  }).toPass()

  // "Move up" swaps with the *immediate* neighbour in the whole nav
  // (lists/list-order.ts), and the suite shares one Radicale — so other
  // tests' lists can sit between these two, and one press then swaps
  // `second` with one of those instead. Press until the pair flips, which
  // tests the same behaviour without assuming the pair is adjacent.
  //
  // The single press this replaces passed only for as long as no other
  // spec created a list concurrently. It broke the moment one did, and
  // read as a bug in reordering rather than an assumption in the test.
  // *(fixed 2026-08-05.)*
  await expect(async () => {
    if ((await pairOrder())[0] === second) return
    await openListMenu(page, second)
    await page.getByRole('menuitem', { name: 'Move up' }).click()
    expect(await pairOrder()).toEqual([second, first])
  }).toPass()

  // The *first* row has no neighbour above it, so "Move up" is disabled
  // there. Asserted on whichever list is actually at the top rather than
  // on one of this test's own pair: with a shared Radicale, neither is
  // reliably at either end of the nav — the previous version asserted
  // "Move down" on `first` assuming it was the bottom row, which only
  // held while no other spec created a list after it.
  // *(fixed 2026-08-05.)*
  // Its own kebab, reached through the row rather than looked up by name:
  // the top list may be any of the suite's, and a by-name lookup matches
  // both the drawer's and the pinned sidebar's copy on desktop.
  await page
    .getByRole('navigation', { name: 'Lists' })
    .getByRole('listitem')
    .first()
    .getByRole('button', { name: /^Actions for / })
    .click()
  await expect(page.getByRole('menuitem', { name: 'Move up' })).toBeDisabled()
  await page.keyboard.press('Escape')

  // Drop the persisted query cache before reloading, so the assertion is
  // about the server rather than about IndexedDB — same reasoning as the
  // colour test above.
  await reloadFromServer(page)
  await expect(async () => {
    expect(await pairOrder()).toEqual([second, first])
  }).toPass()
})

// docs/specs/ui.md — overlays: the footer's second "Close" became Reset,
// since the header's ✕ already closes the panel. Reverting had no control
// at all before — it meant closing and reopening.
test('Reset discards an edit and restores the stored values', async ({
  page,
}) => {
  await login(page)
  await createList(page, uniqueName('revert-check'))
  await addTodo(page, 'Original summary')
  await waitForSync(page)

  await page.getByText('Original summary').click()
  const summary = page.getByRole('textbox', { name: 'Summary' })
  const reset = page.getByRole('button', { name: 'Reset', exact: true })
  // Nothing to undo yet, so it is disabled — the same rule Save follows.
  await expect(reset).toBeDisabled()

  await summary.fill('Edited but not saved')
  await expect(page.getByText('Unsaved changes')).toBeVisible()
  await expect(reset).toBeEnabled()

  await reset.click()
  await expect(summary).toHaveValue('Original summary')
  await expect(page.getByText('Unsaved changes')).toBeHidden()
  await expect(reset).toBeDisabled()
})

// docs/specs/todos.md — a completed todo is read-only until unlocked, and
// Duplicate is the "the scope changed" answer that makes the lock a choice
// rather than an obstacle (issue #25).
test('a completed todo locks, unlocks deliberately, and duplicates active', async ({
  page,
}) => {
  await login(page)
  await createList(page, uniqueName('locking'))
  await addTodo(page, 'Finished work')
  await waitForSync(page)

  await page
    .getByRole('checkbox', { name: 'Mark "Finished work" done' })
    .click()
  await page.getByRole('button', { name: 'Completed (1)' }).click()
  await page.getByText('Finished work').click()

  // Locked: the fields are inert and the panel says why.
  const summary = page.getByRole('textbox', { name: 'Summary' })
  await expect(summary).toBeDisabled()
  // Scoped to the header's lock pill, not any "Completed" on the page. A
  // bare exact-text match also caught the metadata row's "Completed"
  // label, which only renders once COMPLETED has come back from the
  // server — so this assertion passed or failed on sync timing rather
  // than on the thing it is testing. *(fixed 2026-08-05.)*
  await expect(
    page.getByTestId('lock-status').getByText('Completed', { exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save' })).toBeHidden()

  // Duplicate is offered while locked, and opens the copy — which is
  // active, so its fields are editable. It sits on its own row below the
  // actions, styled as a link rather than a button
  // *(changed 2026-08-04: was an icon button named "Duplicate")*.
  await page
    .getByRole('button', { name: 'Duplicate this todo', exact: true })
    .click()
  await expect(summary).toHaveValue('Finished work (copy)')
  await expect(summary).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Save' })).toBeVisible()

  // The source is still there and still completed — duplicating copies,
  // it never moves or reopens the original.
  await page.getByRole('button', { name: 'Close', exact: true }).first().click()
  await expect(
    page.getByRole('checkbox', { name: 'Mark "Finished work" active' }),
  ).toBeVisible()
})

// docs/specs/ui.md — keyboard shortcuts (issue #5). The unit tests cover
// the matching rules; this covers the wiring those rules can't see — that
// the chord reaches a real listener and opens the real modal, and that the
// "don't stack a second dialog" rule holds against actual Base UI dialogs
// rather than a boolean.
test('keyboard shortcuts open the modals, and stand down when one is open', async ({
  page,
}) => {
  await login(page)
  const listName = uniqueName('shortcuts')
  await createList(page, listName)
  await expect(page.getByRole('heading', { name: listName })).toBeVisible()

  // Ctrl on every platform, including macOS — one family, no branch
  // (docs/specs/ui.md — keyboard shortcuts). This test used to compute
  // Meta-vs-Control from `navigator.platform`; there is nothing to compute
  // any more. *(changed 2026-08-04.)*
  const mod = 'Control'

  // Focus must not be in a text field, or the shortcut correctly declines
  // to steal the keystroke.
  // K, not N: the browser reserves Cmd+N and never releases the keydown to
  // the page (docs/specs/ui.md — keyboard shortcuts).
  await page.locator('body').click()
  await page.keyboard.press(`${mod}+k`)
  const addDialog = page.getByRole('dialog', { name: 'Add a todo' })
  await expect(addDialog).toBeVisible()

  // Pressing it again must not stack a second dialog on the first.
  await page.keyboard.press(`${mod}+k`)
  await expect(page.getByRole('dialog', { name: 'Add a todo' })).toHaveCount(1)

  await page.keyboard.press('Escape')
  await expect(addDialog).toBeHidden()

  // Shift routes to the other binding rather than firing both.
  await page.locator('body').click()
  await page.keyboard.press(`${mod}+Shift+n`)
  await expect(page.getByRole('dialog', { name: 'New list' })).toBeVisible()
  await page.keyboard.press('Escape')

  // The map documents itself: the help modal lists what is bound, rendered
  // from the same constant that binds it.
  await page.locator('body').click()
  await page.keyboard.press(`${mod}+/`)
  const help = page.getByRole('dialog', { name: 'Help' })
  await expect(help).toBeVisible()
  await expect(
    help.getByRole('heading', { name: 'Keyboard shortcuts' }),
  ).toBeVisible()
  // One row per binding, each drawn as individual keycaps
  // (shortcut-keys.tsx) — so assert the rows, not the caps, which vary
  // with how many keys a chord has.
  await expect(help.getByRole('term')).toHaveCount(5)
  // The chord for New todo is K, held for the command palette it will
  // become (issue #26).
  await expect(help.getByRole('term').first().locator('kbd').last()).toHaveText(
    'K',
  )
  await page.keyboard.press('Escape')
  await expect(help).toBeHidden()

  // Ctrl+Shift+1/2 jump straight to the derived views. Shift is what makes
  // a digit usable at all: plain Ctrl+1 is taken by the OS for Spaces and
  // again by some browsers for tabs, so the keydown never arrives. Matched
  // on `event.code`, since Shift+1 reports `event.key` as "!".
  await page.locator('body').click()
  await page.keyboard.press(`${mod}+Shift+Digit2`)
  await expect(page.getByRole('heading', { name: 'Summary' })).toBeVisible()
  await page.keyboard.press(`${mod}+Shift+Digit1`)
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()

  // The whole point of issue #15: New todo works from a derived view too,
  // because it carries its own list picker. It used to do nothing here.
  await page.getByRole('button', { name: 'Today', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
  await page.locator('body').click()
  await page.keyboard.press(`${mod}+k`)
  await expect(addDialog).toBeVisible()

  // No default list, deliberately: submitting without choosing must be
  // refused rather than filing the todo somewhere unlooked-at.
  const summary = page.getByRole('textbox', { name: 'Add a todo' })
  await summary.fill('Made from Today')
  await addDialog.getByRole('button', { name: 'Add', exact: true }).click()
  // `exact` matters: the picker's own placeholder is "Choose a list…", so
  // a substring match would also find the trigger and pass regardless.
  await expect(
    addDialog.getByText('Choose a list', { exact: true }),
  ).toBeVisible()
  await expect(addDialog).toBeVisible()

  // Choosing one lets it through, and the app follows the todo to the list
  // it landed in — being left on a view that may not contain it reads as a
  // failure.
  await addDialog.getByRole('combobox', { name: 'List' }).click()
  await page.getByRole('option', { name: listName, exact: true }).click()
  await addDialog.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(addDialog).toBeHidden()
  await expect(page.getByRole('heading', { name: listName })).toBeVisible()
  await expect(page.getByText('Made from Today')).toBeVisible()
})
