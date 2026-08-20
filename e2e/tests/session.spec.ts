import { expect, test } from '@playwright/test'
import { login } from './helpers'

// Regression for the stale-session bug (fixed 84244ff): `['session']` was
// persisted to IndexedDB with staleTime Infinity, so a reload rendered the
// signed-in UI from a stale cached record even after the sealed session
// cookie was gone — empty lists, then a 401 on the first write. The suite
// otherwise always signs in fresh within a single page load, so it could
// never exercise "was signed in, cookie now gone, reload" — this spec
// exists specifically to close that gap.
test('reload after the session cookie is gone shows the login form, not a stale shell', async ({
  page,
  context,
}) => {
  await login(page)
  await expect(
    page.getByRole('button', { name: 'New list', exact: true }),
  ).toBeVisible()

  // The session cookie is httpOnly, so page JS can't clear it — this is
  // the same "cookie is gone" state a server restart or expiry produces.
  await context.clearCookies()
  await page.reload()

  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'New list', exact: true }),
  ).not.toBeVisible()
})
