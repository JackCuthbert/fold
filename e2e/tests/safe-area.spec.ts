import { expect, test, type Page } from '@playwright/test'
import { addTodo, createList, login, uniqueName, waitForSync } from './helpers'

test.use({ hasTouch: true })

// Chromium reports zero for safe-area env() values. Rewrite the loaded rules
// so the app's real padding calculations run with zero and iPhone insets.
function rewriteSafeAreaRules() {
  const pending = [...document.styleSheets].flatMap((sheet) => [
    ...sheet.cssRules,
  ])
  while (pending.length > 0) {
    const rule = pending.pop()
    if (rule instanceof CSSStyleRule) {
      for (const property of rule.style) {
        const value = rule.style.getPropertyValue(property)
        if (!value.includes('env(safe-area-inset-')) continue
        rule.style.setProperty(
          property,
          value
            .replaceAll(
              'env(safe-area-inset-bottom)',
              'var(--test-bottom-inset)',
            )
            .replaceAll('env(safe-area-inset-top)', 'var(--test-top-inset)'),
          rule.style.getPropertyPriority(property),
        )
      }
    } else if (rule instanceof CSSGroupingRule) {
      pending.push(...rule.cssRules)
    }
  }
}

async function simulateInsets(page: Page) {
  await page.evaluate(rewriteSafeAreaRules)
}

async function setInsets(page: Page, bottom: number) {
  await page.evaluate((value) => {
    document.documentElement.style.setProperty(
      '--test-top-inset',
      `${value ? 59 : 0}px`,
    )
    document.documentElement.style.setProperty(
      '--test-bottom-inset',
      `${value}px`,
    )
  }, bottom)
}

test('safe-area insets keep the page fixed and floating actions at their normal gap', async ({
  page,
}) => {
  await login(page)
  await createList(page, uniqueName('safe-area'))
  for (let i = 0; i < 30; i += 1) await addTodo(page, `Item number ${i}`)
  await waitForSync(page)

  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 })
    if (width >= 768) {
      await page.getByRole('button', { name: 'Lists' }).click()
    }
    await expect(page.locator('[class*=barStandalone]')).toBeVisible()
    await simulateInsets(page)
    for (const inset of [0, 34]) {
      await setInsets(page, inset)
      const measured = await page.evaluate(() => {
        const root = document.querySelector('#root')
        const scroller = document.querySelector(
          '[class*=mainScroll]:not([class*=Inner])',
        )
        const bar = document.querySelector('[class*=barStandalone]')
        if (
          !(root instanceof HTMLElement) ||
          !(scroller instanceof HTMLElement) ||
          !(bar instanceof HTMLElement)
        ) {
          throw new Error('safe-area layout elements not found')
        }
        return {
          rootBottomPadding: parseFloat(getComputedStyle(root).paddingBottom),
          pageHeight: document.documentElement.scrollHeight,
          pageWidth: document.documentElement.scrollWidth,
          listOverflows: scroller.scrollHeight > scroller.clientHeight,
          scrollBottom: scroller.getBoundingClientRect().bottom,
          barBottom: bar.getBoundingClientRect().bottom,
        }
      })
      expect(measured.rootBottomPadding).toBe(inset)
      expect(measured.pageHeight).toBe(844)
      expect(measured.pageWidth).toBe(width)
      expect(measured.listOverflows).toBe(true)
      expect(Math.round(844 - measured.scrollBottom)).toBe(inset)
      expect(Math.round(measured.scrollBottom - measured.barBottom)).toBe(16)
    }
  }
})

test('portalled drawer and detail sheet include the bottom inset in scrolling content', async ({
  page,
}) => {
  await login(page)
  await createList(page, uniqueName('overlay-safe-area'))
  await addTodo(page, 'One item')
  await waitForSync(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await simulateInsets(page)

  for (const inset of [0, 34]) {
    await setInsets(page, inset)
    await page.getByText('One item').click()
    const sheet = page.locator('[class*=popup][role=dialog]')
    await expect(sheet).toBeVisible()
    await page.waitForTimeout(400)
    const form = page.locator('[class*=popup] form')
    expect(
      await form.evaluate((node) =>
        parseFloat(getComputedStyle(node).paddingBottom),
      ),
    ).toBe(12 + inset)
    await form.evaluate((node) => {
      node.scrollTop = node.scrollHeight
    })
    const sheetBottom = await sheet.evaluate((node) => ({
      viewport: window.innerHeight,
      panel: Math.round(node.getBoundingClientRect().bottom),
      scroller: Math.round(
        node.querySelector('form')?.getBoundingClientRect().bottom ?? -1,
      ),
    }))
    expect(sheetBottom.panel).toBe(sheetBottom.viewport)
    expect(sheetBottom.scroller).toBe(sheetBottom.panel)
    await page.keyboard.press('Escape')
    await expect(sheet).toBeHidden()

    await page.getByRole('button', { name: 'Lists' }).click()
    const drawer = page.locator('[class*=navOpen]')
    await expect(drawer).toBeVisible()
    await page.waitForTimeout(400)
    const footer = page.locator('[class*=navOpen] [class*=footer]')
    expect(
      await footer.evaluate((node) =>
        parseFloat(getComputedStyle(node).paddingBottom),
      ),
    ).toBe(8 + inset)
    expect(
      await footer.evaluate((node) =>
        Math.round(node.getBoundingClientRect().bottom),
      ),
    ).toBe(await page.evaluate(() => window.innerHeight))
    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
  }
})
