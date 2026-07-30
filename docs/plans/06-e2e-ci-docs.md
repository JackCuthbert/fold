# Plan 06: E2E, CI, Documentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Playwright happy-path e2e against a real Radicale, a CI pipeline enforcing every agent rule, and the per-feature user guides + architecture decision docs required by CLAUDE.md.

**Architecture:** e2e is its own workspace driving the **built** client served by the real Bun server against a throwaway Radicale — the only layer that exercises the whole stack, covering exactly the three paths in [testing](../specs/testing.md) and nothing already covered below.

**Tech Stack:** @playwright/test, GitHub Actions, Radicale (via uv).

---

### Task 1: e2e workspace + happy path

**Files:**
- Create: `e2e/package.json`, `e2e/tsconfig.json`, `e2e/playwright.config.ts`,
  `e2e/tests/helpers.ts`, `e2e/tests/happy-path.spec.ts`
- Modify: root `package.json` (add `test:e2e` script), `.gitignore`
  (add `.radicale-data/`)

- [ ] **Step 1: Scaffold**

`e2e/package.json`:

```json
{
  "name": "@caldav-todo/e2e",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "rm -rf .radicale-data && bun run --filter @caldav-todo/client build && playwright test",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@playwright/test": "^1.50.0",
    "typescript": "^7.0.0"
  }
}
```

`e2e/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "include": ["tests", "playwright.config.ts"]
}
```

`e2e/playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test'

// E2E happy paths only — docs/specs/testing.md.
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:3300' },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /mobile/,
    },
    {
      name: 'mobile',
      // Pixel 7 keeps us chromium-only in CI.
      use: { ...devices['Pixel 7'] },
      testMatch: /mobile/,
    },
  ],
  webServer: [
    {
      command:
        'radicale --auth-type none --server-hosts 127.0.0.1:5233 --storage-filesystem-folder .radicale-data',
      url: 'http://127.0.0.1:5233',
      reuseExistingServer: false,
    },
    {
      command: 'bun ../apps/server/src/index.ts',
      url: 'http://127.0.0.1:3300',
      reuseExistingServer: false,
      env: {
        PORT: '3300',
        SESSION_SECRET: 'e2e-secret-16-chars-min',
      },
    },
  ],
})
```

Add to root `package.json` scripts:

```json
"test:e2e": "bun run --filter @caldav-todo/e2e test"
```

Append `.radicale-data/` to `.gitignore`.

Run: `bun install && bunx playwright install chromium`

- [ ] **Step 2: Helpers + happy path spec**

`e2e/tests/helpers.ts`:

```ts
import type { Page } from '@playwright/test'

export const CALDAV_URL = 'http://127.0.0.1:5233/e2e-user/'

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

export async function addTodo(page: Page, summary: string): Promise<void> {
  const input = page.getByLabel('Add a todo')
  await input.fill(summary)
  await input.press('Enter')
}
```

`e2e/tests/happy-path.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { addTodo, createList, login, uniqueName } from './helpers'

test('login → create list → add → complete → clear completed', async ({
  page,
}) => {
  await login(page)

  const listName = uniqueName('groceries')
  await createList(page, listName)
  await expect(page.getByRole('heading', { name: listName })).toBeVisible()

  await addTodo(page, 'Buy milk')
  await addTodo(page, 'Buy bread')
  await expect(page.getByText('Buy milk')).toBeVisible()
  await expect(page.getByText('Buy bread')).toBeVisible()

  await page
    .getByRole('checkbox', { name: 'Mark "Buy milk" done' })
    .click()
  await expect(
    page.getByRole('button', { name: 'Completed (1)' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Completed (1)' }).click()
  await page.getByRole('button', { name: 'Clear completed' }).click()
  await page.getByRole('button', { name: 'Delete 1' }).click()
  await expect(page.getByText('Buy milk')).toBeHidden()
  await expect(page.getByText('Buy bread')).toBeVisible()

  // Survives a reload — it's really on the server.
  await page.reload()
  await expect(page.getByText('Buy bread')).toBeVisible()
})
```

- [ ] **Step 3: Run it**

Run: `bun run test:e2e`
Expected: desktop project PASS (mobile has no matching spec yet). Playwright
selectors may need small adjustments to match the built UI — fix the
*selector*, never weaken an assertion.

- [ ] **Step 4: Lint, format, commit**

```bash
bun run lint && bun run fmt
git add -A && git commit -m "test(e2e): happy path against radicale"
```

---

### Task 2: Offline + mobile specs

**Files:**
- Create: `e2e/tests/offline.spec.ts`, `e2e/tests/mobile.spec.ts`

- [ ] **Step 1: Write the specs**

`e2e/tests/offline.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { addTodo, createList, login, uniqueName } from './helpers'

test('offline actions queue and replay on reconnect', async ({
  page,
  context,
}) => {
  await login(page)
  const listName = uniqueName('offline')
  await createList(page, listName)
  await addTodo(page, 'Synced before outage')
  await expect(page.getByText('Synced before outage')).toBeVisible()

  await context.setOffline(true)

  await addTodo(page, 'Written while offline')
  await page
    .getByRole('checkbox', { name: 'Mark "Synced before outage" done' })
    .click()
  await expect(page.getByText('Written while offline')).toBeVisible()
  await expect(page.getByText(/Offline · \d+ queued/)).toBeVisible()

  await context.setOffline(false)
  await expect(page.getByText(/Offline/)).toBeHidden({ timeout: 15_000 })

  // Reload proves the changes reached the server, not just the cache.
  await page.reload()
  await expect(page.getByText('Written while offline')).toBeVisible()
  await page.getByRole('button', { name: 'Completed (1)' }).click()
  await expect(page.getByText('Synced before outage')).toBeVisible()
})
```

`e2e/tests/mobile.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { addTodo, login, uniqueName } from './helpers'

test('mobile: drawer navigation and core flow', async ({ page }) => {
  await login(page)

  await page.getByRole('button', { name: 'Lists' }).click()
  const listName = uniqueName('mobile')
  await page.getByRole('button', { name: '+ New list' }).click()
  await page.getByPlaceholder('List name').fill(listName)
  await page.getByRole('button', { name: 'Create', exact: true }).click()

  await expect(page.getByRole('heading', { name: listName })).toBeVisible()
  await addTodo(page, 'Mobile todo')
  await page
    .getByRole('checkbox', { name: 'Mark "Mobile todo" done' })
    .click()
  await expect(
    page.getByRole('button', { name: 'Completed (1)' }),
  ).toBeVisible()
})
```

- [ ] **Step 2: Run** — `bun run test:e2e`
Expected: 3 tests pass across the two projects.

- [ ] **Step 3: Lint, format, commit**

```bash
bun run lint && bun run fmt
git add -A && git commit -m "test(e2e): offline replay and mobile flows"
```

---

### Task 3: CI pipeline

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the workflow**

`.github/workflows/ci.yml`:

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:

jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run lint
      - run: bun run fmt:check
      - run: bun run typecheck
      - run: bun run test

  integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - uses: astral-sh/setup-uv@v5
      - run: uv tool install radicale
      - run: bun install --frozen-lockfile
      - run: bun run test:integration

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - uses: astral-sh/setup-uv@v5
      - run: uv tool install radicale
      - run: bun install --frozen-lockfile
      - run: bunx playwright install --with-deps chromium
      - run: bun run test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: e2e/playwright-report
```

- [ ] **Step 2: Verify locally what CI runs**

Run: `bun run lint && bun run fmt:check && bun run typecheck && bun run test && bun run test:integration && bun run test:e2e`
Expected: everything green.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "ci: lint, typecheck, unit, integration, e2e"
```

---

### Task 4: Architecture decision docs

One file per decision, per CLAUDE.md. Each references the specs it
implements.

**Files:**
- Create: `docs/architecture/bff-architecture.md`,
  `docs/architecture/sealed-cookie-sessions.md`,
  `docs/architecture/outbox-sync.md`,
  `docs/architecture/round-trip-preservation.md`

- [ ] **Step 1: Write the docs**

`docs/architecture/bff-architecture.md`:

```markdown
# Decision: Stateless BFF over raw proxy or client-side CalDAV

Implements [specs/overview](../specs/overview.md) and
[specs/api](../specs/api.md).

The Bun server is a backend-for-frontend: it exposes a JSON API and speaks
CalDAV out the back using tsdav + ical.js (`apps/server/src/caldav/`).

**Why not client-side CalDAV?** CORS makes "works with any compliant
server" impossible from a browser, and DAV/XML in the client bloats it.

**Why not a raw byte-forwarding proxy?** tsdav would then run in the
browser (same problem), and the client would need to parse iCalendar.

**Why stateless?** No database or session table to operate; credentials
travel in an encrypted cookie
([sealed-cookie-sessions](./sealed-cookie-sessions.md)). The tradeoff is
CalDAV discovery round-trips on each API call, acceptable for a personal
todo client.

**Consequences:** handlers depend on a `CaldavGateway` interface, unit
tests fake it, and only the Radicale integration suite touches tsdav.
```

`docs/architecture/sealed-cookie-sessions.md`:

```markdown
# Decision: Credentials sealed in an encrypted cookie

Implements [specs/authentication](../specs/authentication.md).

`POST /api/session` verifies credentials against the CalDAV server, then
seals `{serverUrl, username, password}` with AES-256-GCM
(`apps/server/src/crypto/seal.ts`) into an httpOnly, SameSite=Strict
cookie. Every request unseals it and builds a fresh tsdav client.

**Why store the password at all?** CalDAV has no delegation standard a
generic client can rely on; Basic auth per request is the interoperable
reality. The password is never readable by the browser (httpOnly) and
never stored server-side.

**Why not server-side sessions?** A session table adds state, expiry
management, and another failure mode; sealing keeps the server restartable
and horizontally trivial.

**Consequences:** `SESSION_SECRET` rotation invalidates all sessions
(users just log in again). TLS is mandatory in production — enforced by
the cookie's Secure flag when `NODE_ENV=production`.
```

`docs/architecture/outbox-sync.md`:

```markdown
# Decision: Client-owned outbox instead of TanStack mutation persistence

Implements [specs/sync-and-offline](../specs/sync-and-offline.md).

Reads use TanStack Query persisted to IndexedDB. Writes go through our own
durable FIFO outbox (`packages/outbox`) drained by a `SyncLoop` with
exponential backoff; mutations are zod-validated on load and coalesced on
enqueue (`apps/client/src/sync/coalesce.ts`).

**Why not TanStack's paused-mutation persistence?** Resumed mutations
don't survive reloads reliably without significant custom glue, ordering
across entities is implicit, and coalescing isn't expressible. The outbox
makes ordering, durability, and merging explicit and unit-testable.

**Conflict policy:** last-write-wins. Updates carry ETags; a 412 returns
the fresh copy, the client rebases once, then drops with a toast
(`apps/client/src/sync/process.ts`).

**Consequences:** `packages/outbox` is generic and publishable; sync
behavior is tested without a browser.
```

`docs/architecture/round-trip-preservation.md`:

```markdown
# Decision: Mutate-preserve editing of VTODO resources

Implements [specs/caldav-compliance](../specs/caldav-compliance.md).

Edits never regenerate an `.ics` from our model. `packages/vtodo`
`applyChanges` parses the existing resource with ical.js, touches only
managed properties (SUMMARY, STATUS, PERCENT-COMPLETE, COMPLETED, DUE,
DESCRIPTION, PRIORITY, DTSTAMP, LAST-MODIFIED, SEQUENCE), and reserializes
everything else verbatim — VALARMs, X-props, RRULE, RELATED-TO, sibling
VTODOs.

**Why?** Any other CalDAV client may have attached data we don't model.
Destroying it on edit is the classic interop failure; preserving it is
what "spec compliant" means in practice.

**Enforcement:** `packages/vtodo/test/preservation.test.ts` (fixtures) and
the foreign-property round-trip in the Radicale integration suite.
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "docs: architecture decision records"
```

---

### Task 5: User guide docs

Per CLAUDE.md: one file per feature in `docs/user/`.

**Files:**
- Create: `docs/user/getting-started.md`, `docs/user/lists.md`,
  `docs/user/todos.md`, `docs/user/offline.md`, `docs/user/sound.md`

- [ ] **Step 1: Write the guides**

`docs/user/getting-started.md`:

```markdown
# Getting started

You need a CalDAV server (Radicale, Nextcloud, Baïkal, …) and its URL.

1. Start the app: `SESSION_SECRET=<random string> bun apps/server/src/index.ts`
   (or use your deployment). Open it in a browser.
2. Enter your CalDAV server URL — usually ends with your username, e.g.
   `https://dav.example.com/alice/` — plus your username and password.
3. Sign in. Your todo lists appear on the left (desktop) or behind the ☰
   button (mobile).

Your credentials are encrypted into a browser cookie and sent only to your
own server. Signing out (or clearing cookies) removes them.

See [lists](./lists.md) and [todos](./todos.md) next.
```

`docs/user/lists.md`:

```markdown
# Lists

Each list is a real CalDAV collection — other apps see the same lists.

- **Create:** "+ New list", type a name, Create.
- **Rename:** the ✎ button next to a list's name.
- **Delete:** the × button. You'll be asked to confirm — deleting a list
  deletes all its todos from the server.
- **Switch:** click a list (desktop sidebar) or open ☰ (mobile).

All of this works offline too — changes sync when you're back
([offline](./offline.md)).
```

`docs/user/todos.md`:

```markdown
# Todos

- **Add:** type in the field at the top and press Enter. The field keeps
  focus so you can add several in a row.
- **Complete:** click the circle. It draws a check, strikes the text
  through, and files the todo under "Completed".
- **Edit:** click a todo's text to open details — summary, due date,
  priority (high/medium/low), and notes.
- **Order:** overdue first, then by due date, then priority. Overdue dates
  show in red.
- **Completed section:** collapsed by default with a count. "Clear
  completed" deletes them from the server (asks first).

Everything you do is saved to your CalDAV server immediately — or queued
if you're offline ([offline](./offline.md)).
```

`docs/user/offline.md`:

```markdown
# Working offline

The app keeps working without a connection:

- Your lists and todos stay visible (they're cached on your device).
- Adding, editing, completing, and deleting all work; changes are queued.
- The header shows **Offline · N queued** while disconnected, and
  **Server unreachable** if your network is fine but your CalDAV server
  isn't answering.
- When the connection returns, queued changes upload in order,
  automatically.

If a todo was changed on the server while you were offline, your change
wins where possible; when it can't be applied, you'll see a small notice
and the server's version is shown instead.
```

`docs/user/sound.md`:

```markdown
# Completion sound

Checking off a todo plays a soft pop. It's synthesized on the spot — no
audio files, nothing downloaded.

- **Mute:** the speaker button in the header. The choice is remembered on
  this device.
- The sound never plays if your OS is set to reduced motion.
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "docs: user guides"
```

---

### Task 6: README + final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Write the README**

```markdown
# caldav-todo-client

A simple, offline-resilient todo client for any spec-compliant CalDAV
server (developed against Radicale). Bun BFF + React SPA.

## Quick start

​```bash
bun install
SESSION_SECRET=$(openssl rand -hex 16) bun run --filter @caldav-todo/server dev
bun run --filter @caldav-todo/client dev   # second terminal
​```

Open the Vite URL and sign in with your CalDAV server URL + credentials.

## Commands

| Command | What |
|---|---|
| `bun run lint` / `bun run fmt` | oxlint (type-aware, via tsgolint) / oxfmt |
| `bun run typecheck` | TS 7, strictest |
| `bun run test` | unit tests (vitest) |
| `bun run test:integration` | gateway vs real Radicale (needs `radicale` on PATH) |
| `bun run test:e2e` | Playwright happy paths (needs radicale + chromium) |

## Docs

- Specifications: [docs/specs](docs/specs/overview.md)
- Architecture decisions: [docs/architecture](docs/architecture)
- User guide: [docs/user](docs/user/getting-started.md)
- Agent rules: [CLAUDE.md](CLAUDE.md)
```

(Remove the `​` zero-width characters around the code fence — they're only
here so this plan's own fence doesn't break.)

- [ ] **Step 2: Full verification sweep**

```bash
bun run lint && bun run fmt:check && bun run typecheck && \
bun run test && bun run test:integration && bun run test:e2e
```

Expected: all green. Then walk [specs/overview](../specs/overview.md) goals
one by one and confirm each is demonstrably true (sync-on-action, offline
resilience, multiple lists, compliance suite, micro-interactions, sound,
responsive views, serif/16px inputs).

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "docs: README"
```
