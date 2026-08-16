import { expect, test as playwrightTest, type Page } from '@playwright/test'

/** The running test's info — Playwright exposes it outside a fixture. */
const testInfo = (): { title: string; parallelIndex: number } =>
  playwrightTest.info()

/**
 * Whether this test is running against a real Radicale.
 *
 * Only the `desktop-real` project is (playwright.config.ts); every other
 * project points its app server at the BFF's in-memory fake gateway
 * (docs/specs/testing.md — the two e2e modes). The project name is the
 * single source of truth, so a spec never has to be told which mode it is
 * in — `login` and the seeding helpers below branch on this by themselves.
 * *(added 2026-08-14, issue #54.)*
 */
const isRealCaldav = (): boolean =>
  playwrightTest.info().project.name === 'desktop-real'

/**
 * The synthetic CalDAV URL a mocked test signs in against.
 *
 * Never fetched — in fake mode nothing behind the BFF makes a network
 * call — but it is still a real URL, because `credentialsSchema` validates
 * it (`z.url()`) and the account key is derived from it plus the username
 * (fake-gateway.ts — `keyFor`). `.invalid` is the RFC 2606 reserved TLD,
 * so a stray request could never resolve to somebody's real host.
 */
const FAKE_CALDAV_URL = 'http://fake-caldav.invalid/dav/'

/**
 * Accounts `seedLists` has already put into a known state this run.
 *
 * `seedLists` resets *and* populates in one request, and it must run
 * before sign-in — so `login` has to know not to reset over the top of it.
 * Keyed by account name, which is derived from the test's own title and
 * worker index (`currentTestUser`), so entries never collide between
 * tests even though a worker process runs many of them in sequence.
 */
const seededAccounts = new Set<string>()

// Set by global-setup.ts, which runs once in Playwright's root process
// before any worker spawns, to the throwaway Docker container's
// Docker-assigned host port — see helpers/radicale-container.ts. Worker
// processes inherit it because Node subprocesses inherit their parent's
// environment by default.
function requireCaldavBase(): string {
  const base = process.env['E2E_CALDAV_URL']
  if (!base) {
    throw new Error(
      'E2E_CALDAV_URL is not set — global-setup.ts should have set it ' +
        'after starting the throwaway Radicale container',
    )
  }
  return base
}

/**
 * The collection root for a given CalDAV user.
 *
 * Against a real Radicale the container runs with `[auth] type = none`
 * (helpers/radicale-container.ts), so any username authenticates and each
 * gets a collection root of its own. In fake mode there is no server at
 * all, so the URL is synthetic — the account is still per-user, since the
 * fake keys its state on URL plus username.
 */
export const caldavUrlFor = (user: string): string =>
  isRealCaldav() ? `${requireCaldavBase()}/${user}/` : FAKE_CALDAV_URL

/** The credentials a given test signs in with, in either mode. */
const credentialsFor = (
  user: string,
): { serverUrl: string; username: string; password: string } => ({
  serverUrl: caldavUrlFor(user),
  username: user,
  password: 'anything',
})

/**
 * Sign in as a user of this **test's own**, derived from its title.
 *
 * Every spec used to share one `e2e-user`, which made the whole suite
 * share one nav. That is where a run of confusing failures came from: a
 * reorder spec assuming its two lists were adjacent, a count assuming
 * only its own todos were in Today, a header timing out because eighteen
 * accumulated lists each cost a conditional request on first paint. All
 * three were assumptions about state another spec owned.
 *
 * A user per test removes the class rather than patching instances. It is
 * free here — no account setup, no cleanup — because auth is off and
 * storage is thrown away with the container.
 *
 * Pass an explicit `user` only to *share* an account deliberately (a test
 * that signs out and back in, say).
 * *(added 2026-08-05.)*
 */
export async function login(page: Page, user?: string): Promise<void> {
  const account = user ?? currentTestUser()
  // In fake mode the account lives in the app server's memory and would
  // otherwise carry over between the two projects that can share a title
  // (desktop and mobile) — and between repeat runs against a reused
  // server. Resetting here means every mocked test starts from an empty
  // nav for the same reason a real one does: a fresh account.
  //
  // Skipped when the test already called `seedLists`, which resets and
  // populates in one request: seeding has to happen *before* sign-in (the
  // client reads lists on first paint), so a reset here would silently
  // throw the seed away and the spec would sign in to an empty nav.
  // *(added 2026-08-14, issue #54.)*
  if (!isRealCaldav() && !seededAccounts.has(account)) {
    await resetFakeAccount(page, account)
  }
  const credentials = credentialsFor(account)
  await page.goto('/')
  await page.getByLabel('Server URL').fill(credentials.serverUrl)
  await page.getByLabel('Username').fill(credentials.username)
  await page.getByLabel('Password').fill(credentials.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

/**
 * Post to the fake gateway's admin route (docs/specs/testing.md).
 *
 * Through `page.request`, so it goes to the same `baseURL` the browser
 * uses and no port has to be threaded into every spec. The route only
 * exists when the app server runs with `CALDAV_FAKE=1`
 * (apps/server/src/api/testing/fake-admin.ts), which is why every helper
 * below refuses to run in the real-CalDAV project rather than silently
 * doing nothing.
 */
async function postFakeAdmin(
  page: Page,
  body: Record<string, unknown>,
): Promise<void> {
  if (isRealCaldav()) {
    throw new Error(
      'the fake gateway helpers are only available in the mocked ' +
        'projects — the desktop-real project runs against a real ' +
        'Radicale (docs/specs/testing.md)',
    )
  }
  const response = await page.request.post('/api/testing/fake', {
    data: body,
  })
  if (!response.ok()) {
    throw new Error(
      `fake admin route failed: ${response.status()} ${await response.text()}`,
    )
  }
}

/** Wipe an account's fake state — lists, todos and any staged faults. */
async function resetFakeAccount(page: Page, user: string): Promise<void> {
  await postFakeAdmin(page, {
    credentials: credentialsFor(user),
    reset: true,
  })
}

/**
 * One list to seed.
 *
 * A hand-written mirror of the admin route's zod schema
 * (`seedListSchema`, apps/server/src/caldav/fake-gateway.ts) rather than
 * an import of it: the e2e package deliberately imports from neither
 * `apps/` nor the client, so the two cannot share a declaration. The
 * duplication is bounded and self-correcting — the route validates every
 * request with the real schema and `postFakeAdmin` throws on a non-2xx,
 * so a shape that drifts out of step fails the run loudly at the first
 * seeded spec rather than silently seeding nothing.
 */
export interface SeedList {
  id?: string
  displayName: string
  color?: string
  order?: number
  todos?: SeedTodo[]
}

/**
 * A todo to seed. The four RFC 5545 DUE forms are spelled out rather than
 * left as `unknown`: a malformed due date would otherwise typecheck and
 * only fail as a 400 at run time.
 */
export interface SeedTodo {
  uid?: string
  summary: string
  completed?: boolean
  due?:
    | { kind: 'date'; value: string }
    | { kind: 'utc'; value: string }
    | { kind: 'floating'; value: string }
    | { kind: 'zoned'; tzid: string; value: string }
  description?: string
  priority?: 'high' | 'medium' | 'low'
  created?: string
  completedAt?: string
}

/**
 * Put an account into a known state before signing in.
 *
 * Replaces its contents outright, so a spec describes the world it wants
 * rather than building it click by click. Call *before* `login` — the
 * client reads lists on first paint, and seeding after that would race it.
 *
 * The cost this removes is the point of issue #54: arranging four todos
 * across two lists through the UI is four modal round-trips and four
 * `waitForSync` calls, every one of which was a real CalDAV write.
 * *(added 2026-08-14, issue #54.)*
 */
export async function seedLists(
  page: Page,
  lists: SeedList[],
  user?: string,
): Promise<void> {
  const account = user ?? currentTestUser()
  // Enforced rather than merely documented: seeding after the client has
  // painted leaves the nav showing the pre-seed world, and the spec then
  // fails somewhere far from the cause. `about:blank` is where a page
  // sits before `login` navigates it.
  if (!page.url().startsWith('about:')) {
    throw new Error(
      'seedLists must be called before login — the client reads lists on ' +
        'first paint, so seeding afterwards races it ' +
        '(docs/specs/testing.md — seeding)',
    )
  }
  await postFakeAdmin(page, {
    credentials: credentialsFor(account),
    reset: true,
    lists,
  })
  // So the `login` that follows does not reset this away again.
  seededAccounts.add(account)
}

/**
 * Stage an upstream failure for the next `count` matching calls.
 *
 * `status: 0` means "could not reach the CalDAV server at all", which the
 * BFF maps to the 502 the client reads as "keep the queue" — the honest
 * reproduction of a server blip, staged at the gateway rather than
 * intercepted at the browser.
 *
 * A spec that wants a specific HTTP status *at the client* should keep
 * using `page.route` instead: that is a different boundary and a
 * legitimate one (docs/specs/testing.md — staging an error state).
 * *(added 2026-08-14, issue #54.)*
 */
/**
 * The gateway methods a fault can name.
 *
 * A literal union rather than `string[]`, so a typo is a typecheck failure
 * instead of a 400 from the admin route at run time. Mirrors
 * `FAULT_OPERATIONS` (apps/server/src/caldav/fake-gateway.ts) — see the
 * note on `SeedList` above for why the e2e package restates rather than
 * imports it, and why the drift is self-correcting.
 */
export type FaultOperation =
  | 'login'
  | 'fetchLists'
  | 'createList'
  | 'renameList'
  | 'setListProps'
  | 'deleteList'
  | 'fetchTodos'
  | 'fetchTodo'
  | 'createTodo'
  | 'updateTodo'
  | 'deleteTodo'

export async function stageFault(
  page: Page,
  fault: {
    operations: FaultOperation[]
    status?: number
    delayMs?: number
    count?: number
  },
  user?: string,
): Promise<void> {
  await postFakeAdmin(page, {
    credentials: credentialsFor(user ?? currentTestUser()),
    faults: [fault],
  })
}

/**
 * End a staged outage — "the server is back".
 *
 * Drops every fault without touching the data. A spec can therefore fail
 * writes for as long as it likes and then let them through at a moment it
 * chooses, rather than picking a fault count that has to be tuned against
 * the outbox's retry schedule — the machine-speed dependency CLAUDE.md
 * warns about, and what makes an outage's *recovery* worth asserting.
 * *(added 2026-08-14, issue #54.)*
 */
export async function clearFaults(page: Page, user?: string): Promise<void> {
  await postFakeAdmin(page, {
    credentials: credentialsFor(user ?? currentTestUser()),
    clearFaults: true,
  })
}

/**
 * A Radicale-safe user name for the running test.
 *
 * Derived from the test title so a failure names the account it used, and
 * suffixed with the worker index because the same title can run in two
 * projects (desktop and mobile) at once.
 */
export function currentTestUser(): string {
  const info = testInfo()
  const slug = info.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return `e2e-${slug}-${info.parallelIndex}`
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
  // docs/specs/lists.md — colours: the menu item and the dialog both say
  // "Edit" now, because this edits a list's name *and* its colour.
  // *(changed 2026-08-03: was "Rename".)*
  await page.getByRole('menuitem', { name: 'Edit' }).click()
  const input = page.getByPlaceholder('List name')
  await input.fill(to)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
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
 *
 * **Unchanged by the move to a fake gateway, deliberately** — this is the
 * one answer for all 56 call sites, and none of them needed editing.
 * Issue #54 anticipated this helper becoming "a no-op or waiting on
 * something else"; neither turned out to be necessary, because the fake
 * replaces the BFF's *outbound* CalDAV calls rather than the API the
 * browser talks to. The outbox still queues, still drains through real
 * HTTP to the real router and real handlers, and still clears the pill
 * when it is done — all that changes is that the gateway answers in ~1ms
 * instead of contending for one shared Radicale. So the assertion this
 * makes is exactly as true as before, and simply passes sooner.
 *
 * Had the suite mocked `/api/**` at the browser instead, there would be no
 * outbox drain to wait for and this helper *would* have had to become a
 * fiction — which is a good part of why that boundary was rejected
 * (docs/architecture/e2e-fake-caldav-gateway.md).
 * *(reviewed 2026-08-14, issue #54.)*
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

/**
 * Reload so the assertions that follow are about the **server**, not about
 * IndexedDB.
 *
 * `waitForSync` proves a change reached the server. It says nothing about
 * the persisted query cache, which is restored on reload and — with
 * `staleTime: 30_000`, deliberately, for offline-first use
 * (docs/specs/sync-and-offline.md) — is not refetched for up to 30s. So a
 * plain reload can re-render the pre-mutation snapshot and the assertion
 * passes or fails for the wrong reason.
 *
 * Dropping the persisted cache first removes that variable entirely.
 * Prefer this over `page.reload()` in any test whose point is "it really
 * reached the server". A test that means to exercise *restore-from-cache*
 * should reload plainly instead — and say so.
 *
 * *(extracted 2026-08-04, issue #8: the same block was inline in two
 * tests, and a third that needed it didn't have it.)*
 */
export async function reloadFromServer(page: Page): Promise<void> {
  await waitForSync(page)
  await page.evaluate(
    async () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase('keyval-store')
        request.addEventListener('success', () => resolve())
        request.addEventListener('error', () => reject(request.error))
        // Another connection is still open; the delete will complete when
        // it closes. The reload closes it, so carrying on is correct.
        request.addEventListener('blocked', () => resolve())
      }),
  )
  await page.reload()
}

/**
 * A local calendar date, `days` from today, in the `YYYY-MM-DD` form the
 * `Due` field takes.
 *
 * Local parts rather than `toISOString()`, which converts to UTC first and
 * so lands on the wrong day either side of midnight — the exact bug the
 * app's own `addLocalDays` avoids. `setDate` rolls the month and year.
 * *(added 2026-08-05: was written out inline in list-kinds.spec.ts.)*
 */
export function dateFieldValue(days = 0): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return [
    String(date.getFullYear()),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}
