import { expect, test } from '@playwright/test'
import { addTodo, createList, login, uniqueName, waitForSync } from './helpers'

// docs/specs/ui.md — scrolling: only the list scrolls, never the whole
// page. Installed to the Home Screen the app paints under the notch and the
// home indicator (`viewport-fit=cover`), and `#root` re-inserts that space
// with `env(safe-area-inset-*)`.
//
// The layout inside it must *absorb* those insets rather than add to them.
// It measured `100dvh` while sitting inside a padded parent, so the chain
// came to `100dvh + top + bottom` and the whole page scrolled by exactly
// the insets — on a real iPhone, ~93px of scroll in a view with nothing to
// scroll. Chromium reports every inset as 0, so the insets are injected
// here; without them this can never fail.
// Only the *OS* insets are injected — the corner clearance must still come
// from the real `calc()` in styles/global.css, or this would be asserting
// the test's own arithmetic.
const IPHONE_INSETS =
  '#root{padding-top:59px !important;' +
  'padding-bottom:calc(34px + var(--corner-inset-block-end)) !important}'

// `hasTouch` makes Chromium report `pointer: coarse`, so the corner-inset
// tokens resolve to their real values (styles/tokens.css) rather than
// being injected — the test then fails if those tokens are wrong, not just
// if `#root` stops consuming them.
test.use({ hasTouch: true })

// A floor, not the exact value. `--corner-inset-block-end` is a design
// judgement retuned by eye against a real device; pinning the measurement
// would make every such tweak a test edit. What must not regress is that
// content stays clear of the curve — the safe-area padding being dropped,
// or landing on a container that clips instead of a scroller, is the
// failure this catches.
//
// Set below the current measurement (24px at the drawer, 30px in the
// sheet) so a further tier of tuning does not fail the suite, but above
// the ~20px that a bare `env(safe-area-inset-bottom)` leaves — which is
// where a ~55px corner radius still cuts into the row.
const MIN_BOTTOM_GAP = 22

test('safe-area insets never make the page itself scroll', async ({ page }) => {
  await login(page)
  await createList(page, uniqueName('safe-area'))
  // Enough rows that the *list* genuinely overflows — otherwise a page that
  // cannot scroll proves nothing.
  for (let i = 0; i < 30; i += 1) await addTodo(page, `Item number ${i}`)
  await waitForSync(page)

  // Both sides of the breakpoint: the mobile sheet layout and the desktop
  // column layout are different flex chains and can fail independently.
  for (const [width, height] of [
    [390, 844],
    [1280, 800],
  ] as const) {
    await page.setViewportSize({ width, height })
    await page.addStyleTag({ content: IPHONE_INSETS })
    await page.waitForTimeout(300)

    const measured = await page.evaluate(() => {
      const scroller = document.querySelector(
        '[class*=mainScroll]:not([class*=Inner])',
      )
      if (!(scroller instanceof HTMLElement)) {
        throw new Error('main scroller not found')
      }
      const rect = scroller.getBoundingClientRect()
      return {
        pageScrollHeight: document.documentElement.scrollHeight,
        pageClientHeight: document.documentElement.clientHeight,
        // The corner inset must not push anything sideways either — a
        // horizontal scrollbar would be the same bug on the other axis.
        pageScrollWidth: document.documentElement.scrollWidth,
        pageClientWidth: document.documentElement.clientWidth,
        listOverflows: scroller.scrollHeight > scroller.clientHeight,
        scrollerLeft: Math.round(rect.left),
        scrollerRight: Math.round(rect.right),
        gapBelowScroller: Math.round(window.innerHeight - rect.bottom),
      }
    })

    expect(measured.pageScrollHeight).toBe(measured.pageClientHeight)
    expect(measured.pageScrollWidth).toBe(measured.pageClientWidth)
    expect(measured.listOverflows).toBe(true)
    // Content clears the display's rounded corners by being lifted off the
    // bottom edge — *not* by insetting the sides, which costs width on
    // every row for a curve that only bites at the last one
    // (styles/tokens.css). Checked on mobile only: on desktop the scroller
    // legitimately starts right of the nav column.
    if (width < 768) {
      expect(measured.scrollerLeft).toBe(0)
      expect(measured.scrollerRight).toBe(width)
    }
    expect(measured.gapBelowScroller).toBeGreaterThanOrEqual(MIN_BOTTOM_GAP)
  }
})

// The check above only measures the main scroller, which lives *inside*
// `#root` — so it passed happily while every portalled overlay ignored the
// safe area entirely. A fixed, portalled element resolves against the
// viewport, not its DOM ancestor, so `#root`'s padding never reaches it.
//
// Asserts the *outcome* — content rests clear of the bottom edge — rather
// than which element carries the padding. That distinction matters: the
// clearance has to sit on the scrolling element, so content flows through
// it, and pinning the test to a specific element would have to change
// every time that moves.
test('portalled overlays keep content clear of the bottom edge', async ({
  page,
}) => {
  await login(page)
  await createList(page, uniqueName('overlay-safe-area'))
  await addTodo(page, 'One item')
  await waitForSync(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)

  // Scroll the container to its end, then measure the lowest visible text.
  const lowestTextGap = async (container: string) =>
    page.evaluate((sel) => {
      const root = document.querySelector(sel)
      if (!(root instanceof HTMLElement)) return -1
      const scroller =
        [...root.querySelectorAll('*')].find(
          (n) => n instanceof HTMLElement && n.scrollHeight > n.clientHeight,
        ) ?? root
      if (scroller instanceof HTMLElement)
        scroller.scrollTop = scroller.scrollHeight
      const bottoms = [...root.querySelectorAll('*')]
        .filter((n) => n.children.length === 0 && n.textContent?.trim())
        .map((n) => n.getBoundingClientRect().bottom)
      if (bottoms.length === 0) return -1
      return Math.round(window.innerHeight - Math.max(...bottoms))
    }, container)

  // The mobile detail sheet — its last row is the created/completed meta.
  await page.getByText('One item').click()
  await page.waitForTimeout(400)
  expect(
    await lowestTextGap('[class*=popup][role=dialog]'),
  ).toBeGreaterThanOrEqual(MIN_BOTTOM_GAP)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // The nav drawer, whose footer carries the sync status line.
  await page.getByRole('button', { name: 'Lists' }).click()
  await page.waitForTimeout(400)
  expect(await lowestTextGap('[class*=navOpen]')).toBeGreaterThanOrEqual(
    MIN_BOTTOM_GAP,
  )
})
