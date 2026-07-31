import { expect, type Page } from '@playwright/test'

// Set by global-setup.ts, which runs once in Playwright's root process
// before any worker spawns, to the throwaway Docker container's
// Docker-assigned host port — see helpers/radicale-container.ts. Worker
// processes inherit it because Node subprocesses inherit their parent's
// environment by default.
function requireCaldavUrl(): string {
  const base = process.env['E2E_CALDAV_URL']
  if (!base) {
    throw new Error(
      'E2E_CALDAV_URL is not set — global-setup.ts should have set it ' +
        'after starting the throwaway Radicale container',
    )
  }
  return `${base}/e2e-user/`
}

export const CALDAV_URL = requireCaldavUrl()

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

// docs/specs/ui.md — the nav: per-list Rename/Delete live in a kebab menu
// at the row's right edge rather than inline icon buttons, so a list's
// full name gets nearly the whole row.
export async function openListMenu(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: `Actions for ${name}` }).click()
}

export async function renameList(
  page: Page,
  from: string,
  to: string,
): Promise<void> {
  await openListMenu(page, from)
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  const input = page.getByPlaceholder('List name')
  await input.fill(to)
  await page.getByRole('button', { name: 'Rename', exact: true }).click()
}

// docs/specs/ui.md — adding a todo opens a modal (added 2026-07-31): the
// "Add a todo" button is now the modal's trigger, not the field itself.
// The modal's title field keeps the same accessible name so Enter still
// submits and closes it in one step — the fast path is unchanged from the
// user's perspective, just behind a dialog now.
export async function addTodo(page: Page, summary: string): Promise<void> {
  await page.getByRole('button', { name: 'Add a todo' }).click()
  // The modal itself is also labelled "Add a todo" (its Dialog.Title), so
  // getByLabel would match both the dialog and the field — scope to the
  // textbox role to get just the input.
  const input = page.getByRole('textbox', { name: 'Add a todo' })
  await input.fill(summary)
  await input.press('Enter')
}

/**
 * The outbox is FIFO and drains asynchronously — a `page.reload()` right
 * after a UI action can race an in-flight mutation (the request gets
 * aborted mid-flight, then retried after reload). Waiting for the
 * "Syncing N changes" pill to clear before reloading proves the mutation
 * actually reached the server, matching what the reload assertions in
 * these specs are meant to demonstrate.
 *
 * A plain `toBeHidden()` on the pill would pass trivially if the sync
 * happened to finish (or hadn't started) the instant we check, so this
 * polls until none of "Syncing N change…" / "Offline" appear anywhere on
 * two separate samples in a row — a mutation that gets coalesced in right
 * after the first all-clear sample will still show up on the second.
 * *(changed 2026-07-31: "Server unreachable" no longer appears as pill
 * text — docs/specs/ui.md moved server reachability onto the nav footer's
 * status dot + label instead. The "Syncing \d+ change" branch only matches
 * the pill's fuller text, never the footer's plain "Syncing…" label; the
 * bare "Offline" branch intentionally also catches the footer's own
 * "Offline" label, via `.count()`, which tolerates matching both.)*
 */
export async function waitForSync(page: Page): Promise<void> {
  const isIdle = async (): Promise<boolean> =>
    (await page.getByText(/Syncing \d+ change|Offline/).count()) === 0
  await expect(async () => {
    if (!(await isIdle())) throw new Error('sync still in progress')
    await page.waitForTimeout(200)
    if (!(await isIdle())) throw new Error('sync resumed')
  }).toPass({ timeout: 15_000 })
}

/**
 * `waitForSync` only proves a mutation reached the *server* — it says
 * nothing about the browser's local query-cache persister, which write
 * behinds to IndexedDB on its own throttle (`createAsyncStoragePersister`'s
 * default `throttleTime: 1000`ms — see `apps/client/src/providers.tsx`).
 * `page.reload()` right after `waitForSync` can land inside that 1s window:
 * IndexedDB still holds the pre-mutation snapshot, `PersistQueryClientProvider`
 * restores it, and because todos/lists use `staleTime: 30_000` (deliberately,
 * for offline-first use — docs/specs/sync-and-offline.md), the stale
 * restored data isn't refetched for up to 30s. That's correct app
 * behavior — offline-first caching is meant to show the last-known state
 * immediately rather than blocking on a network round trip — but it means
 * a test that reloads right after a mutation must wait for the *persisted*
 * copy to catch up first, the same way `waitForSync` waits for the
 * *server* copy to catch up. This polls the actual IndexedDB record
 * (`idb-keyval`'s `keyval-store`/`keyval`, key `REACT_QUERY_OFFLINE_CACHE`
 * — the persister's fixed defaults, unconfigured in this app) for the
 * given todo to show the expected `completed` value, so the reload that
 * follows is guaranteed to observe it even before any refetch fires.
 */
export async function waitForPersistedCompleted(
  page: Page,
  todoSummary: string,
  completed: boolean,
): Promise<void> {
  await expect(async () => {
    const found = await page.evaluate(async (summary) => {
      const cacheString = await new Promise<string | null>(
        (resolve, reject) => {
          const openReq = indexedDB.open('keyval-store')
          openReq.addEventListener('error', () => reject(openReq.error))
          openReq.addEventListener('success', () => {
            const db = openReq.result
            const tx = db.transaction('keyval', 'readonly')
            const getReq = tx
              .objectStore('keyval')
              .get('REACT_QUERY_OFFLINE_CACHE')
            getReq.addEventListener('error', () => reject(getReq.error))
            getReq.addEventListener('success', () =>
              resolve(getReq.result ?? null),
            )
          })
        },
      )
      if (!cacheString) return null

      // Walked field-by-field rather than cast: this is JSON.parse'd from
      // IndexedDB, an untrusted-at-the-type-level boundary, and its shape
      // is @tanstack/query-persist-client-core's PersistedClient — not a
      // schema this test package owns or validates elsewhere.
      const parsed: unknown = JSON.parse(cacheString)
      if (typeof parsed !== 'object' || parsed === null) return null
      const { clientState } = parsed as { clientState?: unknown }
      if (typeof clientState !== 'object' || clientState === null) return null
      const { queries } = clientState as { queries?: unknown }
      if (!Array.isArray(queries)) return null

      for (const query of queries as unknown[]) {
        if (typeof query !== 'object' || query === null) continue
        const { queryKey, state } = query as {
          queryKey?: unknown
          state?: unknown
        }
        if (!Array.isArray(queryKey) || queryKey[0] !== 'todos') continue
        if (typeof state !== 'object' || state === null) continue
        const { data } = state as { data?: unknown }
        if (typeof data !== 'object' || data === null) continue
        const { todos } = data as { todos?: unknown }
        if (!Array.isArray(todos)) continue
        for (const todo of todos as unknown[]) {
          if (typeof todo !== 'object' || todo === null) continue
          const { summary: todoText, completed: isCompleted } = todo as {
            summary?: unknown
            completed?: unknown
          }
          if (todoText === summary) return isCompleted === true
        }
      }
      return null
    }, todoSummary)
    if (found !== completed) {
      throw new Error(
        `persisted cache shows completed=${String(found)} for ` +
          `${JSON.stringify(todoSummary)}, expected ${String(completed)}`,
      )
    }
  }).toPass({ timeout: 15_000 })
}
