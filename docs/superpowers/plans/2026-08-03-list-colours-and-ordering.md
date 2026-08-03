# List Colours and Ordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each CalDAV list a colour and a user-chosen position in the nav, both persisted to the server via Apple's `calendar-color` / `calendar-order` extensions, plus an in-app help modal and a reusable "this is a server extension" tooltip.

**Architecture:** Both properties live in the `http://apple.com/ns/ical/` namespace on a collection, are read during discovery and written by one PROPPATCH — so the plumbing (schema field, gateway read/write, one `setListProps` mutation) is built **once for both**, then colours and ordering become small UI features on top. The server is the source of truth: an existing colour set by Apple Reminders renders exactly as stored and is never snapped to our palette.

**Tech Stack:** Bun workspaces, TypeScript (`@tsconfig/strictest`, `exactOptionalPropertyTypes`), zod v4, tsdav, React 19, TanStack Query, Base UI, CSS Modules, vitest, Playwright, Docker-based Radicale.

**Spec:** [2026-08-03-list-colours-and-ordering-design.md](../specs/2026-08-03-list-colours-and-ordering-design.md)

---

## Verified facts (probed against real Radicale 3.5.4.0 on 2026-08-03)

Do not re-derive these — they were confirmed live with a throwaway container:

- `MKCALENDAR` accepts `ca:calendar-color` and `ca:calendar-order` inline. tsdav's `makeCalendar` already declares the `http://apple.com/ns/ical/` namespace.
- `fetchCalendars()` requests `ca:calendar-color` **by default** and returns it as `calendar.calendarColor` (e.g. `"#1D9BF6FF"`).
- `calendar-order` is **not** requested by default. Passing explicit `props` plus `projectedProps: { calendarOrder: true }` returns it under `calendar.projectedProps.calendarOrder`.
- Radicale returns `calendarOrder` as a **JS number** (`7`, not `"7"`). Another server may return a string, so the parser must accept both.
- `PROPPATCH` returns **207 Multi-Status**, not 200. `response.ok` is true for 207, so the existing `assertOk` works.
- A collection with neither property simply **omits them** — no `projectedProps` key at all. That is the `undefined` the schema expects.

## Conventions

- **Always** use root scripts: `bun run lint`, `bun run fmt`, `bun run typecheck`, `bun run test`, `bun run test:integration`, `bun run test:e2e`. Never call `oxlint`/`oxfmt`/`tsc`/`vitest` directly.
- Format and lint before every commit.
- Test **behaviour**, not shape. Never assert that a defined type has its fields.
- No test duplication across unit / integration / e2e layers.
- Styles are co-located CSS Modules. Colours come from tokens, never hard-coded.
- Icons from `react-icons/lu` only.
- Code comments reference the spec file and section they implement.

## File Structure

**`packages/schemas/src/`**
- `list-color.ts` *(new)* — colour normalization, both directions. Pure, no deps.
- `list.ts` — `todoListSchema` gains `color?` / `order?`.
- `api.ts` — request schema for the extended PATCH.
- `mutation.ts` — the `setListProps` mutation kind.
- `index.ts` — re-exports.

**`apps/server/src/`**
- `caldav/gateway.ts` — `setListProps` added to the interface.
- `caldav/tsdav-gateway.ts` — PROPFIND props, parsing, PROPPATCH, MKCALENDAR.
- `api/lists/rename.ts` — handles colour/order alongside `displayName`.

**`apps/client/src/`**
- `lists/list-color.ts` *(new)* — the contrast guard (client-only presentation logic).
- `lists/color-picker.tsx` + `.module.css` *(new)* — swatches, hex field, native picker.
- `lists/list-form.tsx` — colour field added; renamed to reflect it does more than the name.
- `lists/list-nav.tsx` + `.module.css` — the dot, the coloured marker, reorder actions.
- `lists/list-item-menu.tsx` — "Move up" / "Move down".
- `lists/list-order.ts` *(new)* — sort rule and `nextOrder`.
- `extension-badge.tsx` + `.module.css` *(new)* — the reusable tooltip.
- `help-modal.tsx` + `.module.css` *(new)* — the help dialog.
- `lists/nav-footer.tsx` — the `?` trigger.
- `sync/optimistic.ts` — `setListProps` case; delete the stale comment.
- `sync/process.ts` — dispatch `setListProps` to the API.
- `api/client.ts` — send colour/order.

**Docs**
- `docs/specs/lists.md`, `docs/specs/ui.md`, `docs/specs/caldav-compliance.md`, `docs/specs/backlog.md`
- `docs/user/colours-and-ordering.md` *(new)*

---

## Task 1: Colour normalization

Apple writes `#RRGGBBFF`; we store `#RRGGBB`. This is the highest-risk parsing in the feature, so it is isolated, pure, and tested first.

**Files:**
- Create: `packages/schemas/src/list-color.ts`
- Create: `packages/schemas/test/list-color.test.ts`
- Modify: `packages/schemas/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/schemas/test/list-color.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatListColor, parseListColor } from '../src/list-color'

// docs/specs/lists.md — colours: Apple writes 8-digit #RRGGBBAA; we store
// 6. Anything we can't read is treated as absent, never as an error — a
// foreign client writing garbage must not break list discovery.
describe('parseListColor', () => {
  it('drops the alpha suffix Apple writes', () => {
    expect(parseListColor('#1D9BF6FF')).toBe('#1D9BF6')
  })

  it('accepts a plain 6-digit colour unchanged', () => {
    expect(parseListColor('#1D9BF6')).toBe('#1D9BF6')
  })

  it('uppercases, so equal colours compare equal', () => {
    expect(parseListColor('#1d9bf6')).toBe('#1D9BF6')
  })

  it('expands the 3-digit shorthand', () => {
    expect(parseListColor('#ABC')).toBe('#AABBCC')
  })

  it('tolerates surrounding whitespace', () => {
    expect(parseListColor('  #1D9BF6FF \n')).toBe('#1D9BF6')
  })

  it('treats anything unreadable as absent', () => {
    for (const bad of ['', 'red', '#12', '#GGGGGG', '#1D9BF6FFF', 'nonsense']) {
      expect(parseListColor(bad)).toBeNull()
    }
  })

  it('treats a non-string as absent', () => {
    expect(parseListColor(undefined)).toBeNull()
    expect(parseListColor(null)).toBeNull()
    expect(parseListColor(42)).toBeNull()
  })
})

describe('formatListColor', () => {
  it('writes the 8-digit form other clients expect', () => {
    expect(formatListColor('#1D9BF6')).toBe('#1D9BF6FF')
  })

  it('round-trips a value read from the server', () => {
    const stored = '#E8503AFF'
    const parsed = parseListColor(stored)
    expect(parsed).not.toBeNull()
    expect(formatListColor(parsed!)).toBe(stored)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test packages/schemas/test/list-color.test.ts`
Expected: FAIL — cannot resolve `../src/list-color`.

- [ ] **Step 3: Write the implementation**

Create `packages/schemas/src/list-color.ts`:

```ts
/**
 * List colours — docs/specs/lists.md (colours).
 *
 * Apple's `calendar-color` (the `http://apple.com/ns/ical/` namespace) is
 * written as 8 hex digits with an alpha suffix — `#1D9BF6FF`. Fold stores
 * and renders 6.
 *
 * Parsing is deliberately forgiving on input and strict on output: a value
 * we cannot read is treated as **absent** rather than raised, because a
 * foreign client writing something unexpected must not break list
 * discovery (docs/specs/caldav-compliance.md — degrade, don't fail).
 */

const HEX_6 = /^#[0-9A-F]{6}$/
const HEX_8 = /^#[0-9A-F]{8}$/
const HEX_3 = /^#[0-9A-F]{3}$/

/**
 * A server value → our stored `#RRGGBB`, or `null` when it is missing or
 * unreadable. Accepts `unknown` because it is called directly on values
 * parsed out of XML, which are untyped by nature.
 */
export function parseListColor(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim().toUpperCase()
  if (HEX_8.test(value)) return value.slice(0, 7)
  if (HEX_6.test(value)) return value
  if (HEX_3.test(value)) {
    // #ABC → #AABBCC. Rare from a server, but valid CSS, and a user could
    // type it into the hex field.
    const [r, g, b] = [value[1], value[2], value[3]]
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return null
}

/**
 * Our stored `#RRGGBB` → the 8-digit form other clients expect to find.
 * Always fully opaque: Fold has no notion of a translucent list.
 */
export function formatListColor(color: string): string {
  return `${color.toUpperCase()}FF`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test packages/schemas/test/list-color.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Export from the package index**

In `packages/schemas/src/index.ts`, add alongside the existing exports:

```ts
export * from './list-color'
```

- [ ] **Step 6: Verify and commit**

```bash
bun run fmt && bun run lint && bun run typecheck && bun run test
```

Expected: all pass.

```bash
git add packages/schemas/src/list-color.ts packages/schemas/test/list-color.test.ts packages/schemas/src/index.ts
git commit -m "feat(schemas): read and write Apple's calendar-color format"
```

---

## Task 2: Schema fields for colour and order

**Files:**
- Modify: `packages/schemas/src/list.ts`
- Test: `packages/schemas/test/list.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

Create or extend `packages/schemas/test/list.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { todoListSchema } from '../src/list'

const base = { id: 'l', href: '/l/', displayName: 'List', ctag: 'c' }

// docs/specs/lists.md — colours and ordering are optional: a collection
// may carry neither, and a server may ignore them entirely.
describe('todoListSchema', () => {
  it('accepts a list with no colour and no order', () => {
    const parsed = todoListSchema.parse(base)
    expect(parsed.color).toBeUndefined()
    expect(parsed.order).toBeUndefined()
  })

  it('accepts a colour and an order', () => {
    const parsed = todoListSchema.parse({
      ...base,
      color: '#1D9BF6',
      order: 3,
    })
    expect(parsed.color).toBe('#1D9BF6')
    expect(parsed.order).toBe(3)
  })

  it('rejects a colour that is not a stored 6-digit hex', () => {
    // Normalization happens at the boundary (parseListColor); by the time
    // a value reaches the schema it must already be in our stored form.
    expect(() => todoListSchema.parse({ ...base, color: '#1D9BF6FF' })).toThrow()
    expect(() => todoListSchema.parse({ ...base, color: 'red' })).toThrow()
  })

  it('rejects a non-integer order', () => {
    expect(() => todoListSchema.parse({ ...base, order: 1.5 })).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test packages/schemas/test/list.test.ts`
Expected: FAIL — `color: '#1D9BF6FF'` is accepted (no validation yet), and the colour/order assertions fail.

- [ ] **Step 3: Add the fields**

Replace the contents of `packages/schemas/src/list.ts`:

```ts
import { z } from 'zod'

// docs/specs/lists.md — colours and ordering. Both come from Apple
// extensions (`calendar-color` / `calendar-order` in the
// `http://apple.com/ns/ical/` namespace), so both are **optional**: a
// collection may carry neither, and a server may ignore them entirely
// (docs/specs/caldav-compliance.md).
//
// `color` is the stored 6-digit form — `parseListColor` (list-color.ts)
// normalizes the server's 8-digit value before it ever reaches here, so
// this schema is the guarantee that normalization actually happened.
export const todoListSchema = z.object({
  id: z.string().min(1),
  href: z.string().min(1),
  displayName: z.string().min(1),
  ctag: z.string(),
  color: z
    .string()
    .regex(/^#[0-9A-F]{6}$/, 'expected a normalized #RRGGBB colour')
    .optional(),
  order: z.int().optional(),
})
export type TodoList = z.infer<typeof todoListSchema>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test packages/schemas/test/list.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Verify nothing else broke and commit**

```bash
bun run fmt && bun run lint && bun run typecheck && bun run test
```

Expected: all pass. The new fields are optional, so existing code that builds a `TodoList` still compiles.

```bash
git add packages/schemas/src/list.ts packages/schemas/test/list.test.ts
git commit -m "feat(schemas): optional colour and order on a list"
```

---

## Task 3: The setListProps mutation

**Files:**
- Modify: `packages/schemas/src/mutation.ts`
- Modify: `packages/schemas/src/api.ts`
- Test: `packages/schemas/test/mutation.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

Create or extend `packages/schemas/test/mutation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mutationSchema } from '../src/mutation'

const id = '11111111-1111-4111-8111-111111111111'

// docs/specs/lists.md — one mutation kind covers both properties: they are
// written by the same PROPPATCH to the same namespace.
describe('setListProps', () => {
  it('accepts a colour alone', () => {
    const parsed = mutationSchema.parse({
      id,
      kind: 'setListProps',
      listId: 'l',
      color: '#1D9BF6',
    })
    expect(parsed.kind).toBe('setListProps')
  })

  it('accepts an order alone', () => {
    const parsed = mutationSchema.parse({
      id,
      kind: 'setListProps',
      listId: 'l',
      order: 2,
    })
    expect(parsed.kind).toBe('setListProps')
  })

  it('accepts clearing a colour', () => {
    // null means "remove the property", distinct from undefined
    // ("leave it alone") — the same distinction todoChangesSchema makes.
    const parsed = mutationSchema.parse({
      id,
      kind: 'setListProps',
      listId: 'l',
      color: null,
    })
    expect(parsed.kind).toBe('setListProps')
  })

  it('rejects a mutation that changes nothing', () => {
    expect(() =>
      mutationSchema.parse({ id, kind: 'setListProps', listId: 'l' }),
    ).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test packages/schemas/test/mutation.test.ts`
Expected: FAIL — `setListProps` is not a member of the discriminated union.

- [ ] **Step 3: Add the mutation kind**

In `packages/schemas/src/mutation.ts`, add this member to the `mutationSchema` union, immediately after the `renameList` entry:

```ts
  // docs/specs/lists.md — colours and ordering. One kind rather than two:
  // both properties are written by the same PROPPATCH to the same
  // namespace, and splitting them would duplicate a near-identical branch
  // in applyMutationToLists, the outbox, coalescing and process.ts.
  //
  // `null` clears a property; `undefined` leaves it alone — the same
  // distinction todoChangesSchema makes. At least one must be present, or
  // the mutation is a no-op that would still cost a request.
  z
    .object({
      ...base,
      kind: z.literal('setListProps'),
      listId,
      color: z
        .string()
        .regex(/^#[0-9A-F]{6}$/)
        .nullable()
        .optional(),
      order: z.int().nullable().optional(),
    })
    .refine(
      (value) => value.color !== undefined || value.order !== undefined,
      { message: 'setListProps must change at least one property' },
    ),
```

**Note:** `z.discriminatedUnion` accepts a `ZodEffects` member (a `.refine`d object) in zod v4 as long as the discriminator is on the inner object. If the build rejects it, move the check into the API handler and drop the `.refine`, keeping the "rejects a mutation that changes nothing" test at that layer instead.

- [ ] **Step 4: Extend the PATCH request schema**

In `packages/schemas/src/api.ts`, replace `renameListRequestSchema`:

```ts
// docs/specs/lists.md — PATCH carries any subset of a list's mutable
// properties. `displayName` is optional now that colour and order can be
// changed on their own; at least one field must be present.
export const patchListRequestSchema = z
  .object({
    displayName: z.string().min(1).optional(),
    color: z
      .string()
      .regex(/^#[0-9A-F]{6}$/)
      .nullable()
      .optional(),
    order: z.int().nullable().optional(),
  })
  .refine(
    (value) =>
      value.displayName !== undefined ||
      value.color !== undefined ||
      value.order !== undefined,
    { message: 'PATCH must change at least one property' },
  )

/** @deprecated use patchListRequestSchema — kept until callers migrate. */
export const renameListRequestSchema = patchListRequestSchema
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun run test packages/schemas`
Expected: PASS.

- [ ] **Step 6: Verify and commit**

```bash
bun run fmt && bun run lint && bun run typecheck && bun run test
```

```bash
git add packages/schemas/src/mutation.ts packages/schemas/src/api.ts packages/schemas/test/mutation.test.ts
git commit -m "feat(schemas): add the setListProps mutation"
```

---

## Task 4: Gateway — read colour and order

**Files:**
- Modify: `apps/server/src/caldav/tsdav-gateway.ts`
- Test: `apps/server/test/tsdav-gateway.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/server/test/tsdav-gateway.test.ts` (import `toList` alongside the existing `toTodo` import):

```ts
// docs/specs/lists.md — colours and ordering are read from an Apple
// extension, so a collection may carry neither and a foreign client may
// have written something we can't read. Neither case may break discovery.
describe('toList', () => {
  const base = { url: 'https://dav.example/cal/work/', ctag: 'c1' }

  it('reads the 8-digit colour Apple writes', () => {
    const list = toList({ ...base, calendarColor: '#1D9BF6FF' })
    expect(list.color).toBe('#1D9BF6')
  })

  it('reads an order returned as a number', () => {
    // Radicale returns a JS number here — verified live 2026-08-03.
    const list = toList({
      ...base,
      projectedProps: { calendarOrder: 7 },
    })
    expect(list.order).toBe(7)
  })

  it('reads an order returned as a string', () => {
    // Another server may serialize it as text; XML has no number type.
    const list = toList({
      ...base,
      projectedProps: { calendarOrder: '7' },
    })
    expect(list.order).toBe(7)
  })

  it('omits both when the collection has neither', () => {
    const list = toList(base)
    expect(list.color).toBeUndefined()
    expect(list.order).toBeUndefined()
  })

  it('treats an unreadable colour as absent rather than failing', () => {
    const list = toList({ ...base, calendarColor: 'chartreuse' })
    expect(list.color).toBeUndefined()
  })

  it('treats an unreadable order as absent rather than failing', () => {
    const list = toList({
      ...base,
      projectedProps: { calendarOrder: 'seventh' },
    })
    expect(list.order).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test apps/server/test/tsdav-gateway.test.ts`
Expected: FAIL — `toList` is not exported.

- [ ] **Step 3: Extend RawCalendar and hoist `toList`**

In `apps/server/src/caldav/tsdav-gateway.ts`:

Extend the `RawCalendar` interface:

```ts
interface RawCalendar {
  url: string
  displayName?: string | Record<string, unknown>
  ctag?: string
  components?: string[]
  // docs/specs/lists.md — colours: tsdav requests `ca:calendar-color` by
  // default and surfaces it here (verified against Radicale 3.5.4.0).
  calendarColor?: string
  // `calendar-order` is *not* a tsdav default — it arrives here only
  // because fetchCalendars is called with explicit props plus
  // `projectedProps` below.
  projectedProps?: Record<string, unknown>
}
```

Add the props constant beside `VTODO_FILTER`:

```ts
// docs/specs/lists.md — ordering. tsdav's default PROPFIND already asks
// for `ca:calendar-color` but not `ca:calendar-order`, and passing `props`
// *replaces* the defaults rather than extending them — so every property
// the gateway relies on has to be listed here, not just the new one.
const LIST_PROPS = {
  'c:calendar-description': {},
  'c:calendar-timezone': {},
  'd:displayname': {},
  'ca:calendar-color': {},
  'ca:calendar-order': {},
  'cs:getctag': {},
  'd:resourcetype': {},
  'c:supported-calendar-component-set': {},
  'd:sync-token': {},
}

// tsdav only surfaces a non-default property under `projectedProps` when
// it is named here.
const LIST_PROJECTED = { calendarColor: true, calendarOrder: true }
```

Add the order parser next to `escapeXml`:

```ts
/**
 * `calendar-order` → an integer, or `null` when missing or unreadable.
 *
 * Radicale returns a JS number; XML has no number type, so another server
 * may well return a string. Both are accepted, and anything else is
 * treated as absent rather than raised — the same "degrade, don't fail"
 * rule the colour parser follows (docs/specs/caldav-compliance.md).
 */
const parseListOrder = (raw: unknown): number | null => {
  if (typeof raw === 'number') return Number.isInteger(raw) ? raw : null
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!/^-?\d+$/.test(trimmed)) return null
  const value = Number(trimmed)
  return Number.isSafeInteger(value) ? value : null
}
```

Move `toList` out of `makeTsdavGateway` to module scope (it closes over nothing), placing it beside `toTodo` and exporting it:

```ts
// Exported for unit testing, same as `toTodo` above: this is PROPFIND →
// TodoList mapping that needs no live server (docs/specs/testing.md).
export function toList(calendar: RawCalendar): TodoList {
  const color = parseListColor(calendar.calendarColor)
  const order = parseListOrder(calendar.projectedProps?.['calendarOrder'])
  return {
    id: listIdFromHref(calendar.url),
    href: calendar.url,
    displayName:
      typeof calendar.displayName === 'string' && calendar.displayName !== ''
        ? calendar.displayName
        : listIdFromHref(calendar.url),
    ctag: calendar.ctag ?? '',
    // Omitted entirely when absent, never set to undefined —
    // exactOptionalPropertyTypes keeps "no colour" distinct from
    // "colour explicitly unset".
    ...(color !== null ? { color } : {}),
    ...(order !== null ? { order } : {}),
  }
}
```

Delete the old `const toList = (calendar: RawCalendar): TodoList => ({...})` from inside `makeTsdavGateway`.

Add `parseListColor` to the `@fold/schemas` import at the top:

```ts
import {
  type Credentials,
  type NewTodo,
  parseListColor,
  type Todo,
  type TodoChanges,
  type TodoList,
  type TodosResponse,
} from '@fold/schemas'
```

- [ ] **Step 4: Request the new props in every fetchCalendars call**

There are three `client.fetchCalendars()` calls — in `findCalendar`, `fetchLists`, and `createList`. Each must pass the props, or a list read through that path silently loses its colour and order. Replace every bare `client.fetchCalendars()` with:

```ts
client.fetchCalendars({ props: LIST_PROPS, projectedProps: LIST_PROJECTED })
```

To keep that DRY, add this helper inside `makeTsdavGateway`, above `findCalendar`, and call `fetchCalendarsWithProps()` at all three sites:

```ts
  const fetchCalendarsWithProps = (): Promise<RawCalendar[]> =>
    client.fetchCalendars({
      props: LIST_PROPS,
      projectedProps: LIST_PROJECTED,
    }) as Promise<RawCalendar[]>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run test apps/server/test/tsdav-gateway.test.ts`
Expected: PASS, 6 new tests.

- [ ] **Step 6: Verify and commit**

```bash
bun run fmt && bun run lint && bun run typecheck && bun run test
```

```bash
git add apps/server/src/caldav/tsdav-gateway.ts apps/server/test/tsdav-gateway.test.ts
git commit -m "feat(server): read calendar-color and calendar-order"
```

---

## Task 5: Gateway — write colour and order

**Files:**
- Modify: `apps/server/src/caldav/gateway.ts`
- Modify: `apps/server/src/caldav/tsdav-gateway.ts`
- Modify: `apps/server/test/handlers/` fake gateway (wherever `CaldavGateway` is faked)
- Test: `apps/server/test/integration/gateway.test.ts`

- [ ] **Step 1: Write the failing integration test**

Add to `apps/server/test/integration/gateway.test.ts`:

```ts
  // docs/specs/lists.md — colours and ordering round-trip through Apple's
  // calendar-color / calendar-order. Radicale supports both; this is the
  // proof, and it is an integration test because it is entirely about
  // what the server actually stores and returns.
  it('round-trips a list colour and order', async () => {
    await gateway.createList('painted', 'Painted')

    await gateway.setListProps('painted', { color: '#1D9BF6', order: 5 })

    let lists = await gateway.fetchLists()
    let painted = lists.find((list) => list.id === 'painted')
    expect(painted?.color).toBe('#1D9BF6')
    expect(painted?.order).toBe(5)

    // Changing one must not disturb the other.
    await gateway.setListProps('painted', { order: 2 })
    lists = await gateway.fetchLists()
    painted = lists.find((list) => list.id === 'painted')
    expect(painted?.color).toBe('#1D9BF6')
    expect(painted?.order).toBe(2)

    // Renaming must not disturb either — the guarantee that Fold never
    // rewrites what it did not set.
    await gateway.renameList('painted', 'Repainted')
    lists = await gateway.fetchLists()
    painted = lists.find((list) => list.id === 'painted')
    expect(painted?.displayName).toBe('Repainted')
    expect(painted?.color).toBe('#1D9BF6')
    expect(painted?.order).toBe(2)

    await gateway.deleteList('painted')
  })

  it('creates a list with a colour and an order already set', async () => {
    await gateway.createList('born-blue', 'Born blue', {
      color: '#2FA84F',
      order: 9,
    })
    const lists = await gateway.fetchLists()
    const born = lists.find((list) => list.id === 'born-blue')
    expect(born?.color).toBe('#2FA84F')
    expect(born?.order).toBe(9)
    await gateway.deleteList('born-blue')
  })

  it('discovers a list that has neither colour nor order', async () => {
    await gateway.createList('plain', 'Plain')
    const lists = await gateway.fetchLists()
    const plain = lists.find((list) => list.id === 'plain')
    expect(plain?.color).toBeUndefined()
    expect(plain?.order).toBeUndefined()
    await gateway.deleteList('plain')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:integration`
Expected: FAIL — `gateway.setListProps is not a function`, and `createList` takes 2 arguments.

- [ ] **Step 3: Extend the gateway interface**

In `apps/server/src/caldav/gateway.ts`:

```ts
/** docs/specs/lists.md — colours and ordering. */
export interface ListProps {
  /** `null` clears the property; `undefined` leaves it alone. */
  color?: string | null
  order?: number | null
}

export interface CaldavGateway {
  login(): Promise<void>
  fetchLists(): Promise<TodoList[]>
  createList(
    id: string,
    displayName: string,
    props?: ListProps,
  ): Promise<TodoList>
  renameList(listId: string, displayName: string): Promise<void>
  /**
   * PROPPATCH colour and/or order. Optional properties from an Apple
   * extension: a server that ignores them must not fail the request
   * (docs/specs/caldav-compliance.md).
   */
  setListProps(listId: string, props: ListProps): Promise<void>
  deleteList(listId: string): Promise<void>
  // ...the rest unchanged
}
```

- [ ] **Step 4: Implement it**

In `apps/server/src/caldav/tsdav-gateway.ts`, add `setListProps` to the returned object, after `renameList`:

```ts
    setListProps: (listId, props) =>
      translate(async () => {
        await ensureLogin()
        const calendar = await findCalendar(listId)
        // docs/specs/lists.md — colours and ordering. `null` clears a
        // property (D:remove), a value sets it (D:set), and `undefined`
        // omits it from the request entirely so it is left alone.
        const sets: string[] = []
        const removes: string[] = []
        if (props.color === null) {
          removes.push('<CA:calendar-color/>')
        } else if (props.color !== undefined) {
          sets.push(
            `<CA:calendar-color>${escapeXml(
              formatListColor(props.color),
            )}</CA:calendar-color>`,
          )
        }
        if (props.order === null) {
          removes.push('<CA:calendar-order/>')
        } else if (props.order !== undefined) {
          sets.push(
            `<CA:calendar-order>${String(props.order)}</CA:calendar-order>`,
          )
        }
        if (sets.length === 0 && removes.length === 0) return
        const body = `<?xml version="1.0" encoding="utf-8"?>
<D:propertyupdate xmlns:D="DAV:" xmlns:CA="http://apple.com/ns/ical/">
${sets.length > 0 ? `  <D:set><D:prop>${sets.join('')}</D:prop></D:set>` : ''}
${removes.length > 0 ? `  <D:remove><D:prop>${removes.join('')}</D:prop></D:remove>` : ''}
</D:propertyupdate>`
        const response = await fetch(calendar.url, {
          method: 'PROPPATCH',
          headers: {
            ...authHeader(),
            'content-type': 'application/xml; charset=utf-8',
          },
          body,
        })
        // A PROPPATCH returns 207 Multi-Status, which `ok` accepts. A
        // per-property failure inside the body is deliberately NOT treated
        // as an error: these are optional extension properties, and a
        // server that refuses them must not break list editing
        // (docs/specs/caldav-compliance.md).
        assertOk(response)
      }),
```

Add `formatListColor` to the `@fold/schemas` import.

Extend `createList` to accept and send the props:

```ts
    createList: (id, displayName, props) =>
      translate(async () => {
        await ensureLogin()
        const home = client.account?.homeUrl
        if (!home) throw new CaldavError(500, 'no calendar home')
        const url = new URL(`${id}/`, home).href
        // tsdav issues a spec-compliant extended MKCOL/MKCALENDAR, and
        // already declares the http://apple.com/ns/ical/ namespace — so a
        // new list can be born with its colour and order rather than
        // needing a follow-up PROPPATCH (docs/specs/lists.md — a new list
        // must not jump, which needs its order set at creation).
        await client.makeCalendar({
          url,
          props: {
            displayname: displayName,
            ...(props?.color != null
              ? { 'ca:calendar-color': formatListColor(props.color) }
              : {}),
            ...(props?.order != null
              ? { 'ca:calendar-order': String(props.order) }
              : {}),
          },
        })
        const calendars = await fetchCalendarsWithProps()
        const created = calendars.find(
          (entry) => listIdFromHref(entry.url) === id,
        )
        if (!created) throw new CaldavError(500, 'list not created')
        return toList(created)
      }),
```

- [ ] **Step 5: Update the fake gateway used by handler tests**

The fake is in `apps/server/test/helpers/test-app.ts` (not under
`handlers/` — that directory holds the tests themselves).

Add a `setListProps` implementation to it, recording calls the way the
other methods do, and make its `createList` accept the optional third
parameter. Without this, `bun run typecheck` fails: the fake no longer
satisfies `CaldavGateway`.

- [ ] **Step 6: Run the integration suite**

Run: `bun run test:integration`
Expected: PASS. Requires Docker running.

- [ ] **Step 7: Verify and commit**

```bash
bun run fmt && bun run lint && bun run typecheck && bun run test
```

```bash
git add apps/server/src/caldav/ apps/server/test/
git commit -m "feat(server): write calendar-color and calendar-order"
```

---

## Task 6: API handler

**Files:**
- Modify: `apps/server/src/api/lists/rename.ts`
- Modify: `apps/server/src/api/lists/create.ts`
- Test: `apps/server/test/handlers/lists.test.ts` (match the existing filename)

- [ ] **Step 1: Write the failing test**

Add to the existing lists handler test file:

```ts
// docs/specs/lists.md — PATCH carries any subset of a list's mutable
// properties, so a colour change and a rename are one request, not two.
it('patches a colour without touching the name', async () => {
  const gateway = fakeGateway()
  const response = await patchList.handle(
    contextFor(gateway, { listId: 'work' }, { color: '#1D9BF6' }),
  )

  expect(response.status).toBe(204)
  expect(gateway.setListProps).toHaveBeenCalledWith('work', {
    color: '#1D9BF6',
  })
  expect(gateway.renameList).not.toHaveBeenCalled()
})

it('renames and recolours in one request', async () => {
  const gateway = fakeGateway()
  await patchList.handle(
    contextFor(gateway, { listId: 'work' }, {
      displayName: 'Work stuff',
      color: '#E8503A',
    }),
  )

  expect(gateway.renameList).toHaveBeenCalledWith('work', 'Work stuff')
  expect(gateway.setListProps).toHaveBeenCalledWith('work', {
    color: '#E8503A',
  })
})

it('rejects a patch that changes nothing', async () => {
  const gateway = fakeGateway()
  await expect(
    patchList.handle(contextFor(gateway, { listId: 'work' }, {})),
  ).rejects.toThrow()
})
```

Adapt `fakeGateway()` / `contextFor()` to whatever the existing tests in this file already use — do not invent new helpers.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test apps/server/test/handlers/`
Expected: FAIL — `patchList` is not exported.

- [ ] **Step 3: Rewrite the handler**

Replace `apps/server/src/api/lists/rename.ts` with:

```ts
import { patchListRequestSchema } from '@fold/schemas'
import { requireCredentials, type Route } from '../route'

// PATCH /api/lists/:listId — docs/specs/lists.md
//
// Carries any subset of a list's mutable properties. The name lives in
// `displayname` (RFC 4791) while colour and order live in Apple extension
// properties, so they are two different CalDAV requests — but one API call,
// because to the user they are one edit.
export const patchList: Route = {
  method: 'PATCH',
  path: '/api/lists/:listId',
  handle: async (ctx) => {
    const credentials = await requireCredentials(ctx)
    const body = patchListRequestSchema.parse(await ctx.request.json())
    const listId = ctx.params['listId'] ?? ''
    const gateway = ctx.app.makeGateway(credentials)

    if (body.displayName !== undefined) {
      await gateway.renameList(listId, body.displayName)
    }
    if (body.color !== undefined || body.order !== undefined) {
      await gateway.setListProps(listId, {
        ...(body.color !== undefined ? { color: body.color } : {}),
        ...(body.order !== undefined ? { order: body.order } : {}),
      })
    }
    return new Response(null, { status: 204 })
  },
}
```

- [ ] **Step 4: Rename the file and update the router**

```bash
git mv apps/server/src/api/lists/rename.ts apps/server/src/api/lists/patch.ts
```

In `apps/server/src/api/routes.ts`, replace the import and the array entry:

```ts
import { patchList } from './lists/patch'
```

```ts
  patchList,
```

- [ ] **Step 5: Let createList carry colour and order**

In `apps/server/src/api/lists/create.ts`, pass the new optional fields through to the gateway. Extend `createListRequestSchema` in `packages/schemas/src/api.ts` first:

```ts
export const createListRequestSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  color: z
    .string()
    .regex(/^#[0-9A-F]{6}$/)
    .optional(),
  // docs/specs/lists.md — a new list's order is chosen by the client, so
  // the client and server can never disagree about where it goes.
  order: z.int().optional(),
})
```

Then in the handler, forward them:

```ts
    const list = await ctx.app.makeGateway(credentials).createList(
      body.id,
      body.displayName,
      {
        ...(body.color !== undefined ? { color: body.color } : {}),
        ...(body.order !== undefined ? { order: body.order } : {}),
      },
    )
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun run test apps/server/test/`
Expected: PASS.

- [ ] **Step 7: Verify and commit**

```bash
bun run fmt && bun run lint && bun run typecheck && bun run test && bun run test:integration
```

```bash
git add apps/server/src packages/schemas/src/api.ts apps/server/test
git commit -m "feat(server): PATCH a list's colour and order"
```

---

## Task 7: API client and mutation processing

**Files:**
- Modify: `apps/client/src/api/client.ts`
- Modify: `apps/client/src/sync/process.ts`
- Modify: `apps/client/src/sync/optimistic.ts`
- Modify: `apps/client/src/sync/coalesce.ts`
- Test: `apps/client/test/optimistic.test.ts`, `apps/client/test/coalesce.test.ts`

- [ ] **Step 1: Write the failing optimistic test**

Add to `apps/client/test/optimistic.test.ts`:

```ts
// docs/specs/lists.md — colours and ordering apply optimistically, like
// every other mutation, so the nav updates before the server responds.
describe('applyMutationToLists — setListProps', () => {
  const lists: TodoList[] = [
    { id: 'a', href: '/a/', displayName: 'Apples', ctag: '1' },
    { id: 'b', href: '/b/', displayName: 'Bananas', ctag: '1', color: '#111111' },
  ]

  it('sets a colour on the named list only', () => {
    const next = applyMutationToLists(lists, {
      id: 'm1',
      kind: 'setListProps',
      listId: 'a',
      color: '#1D9BF6',
    })
    expect(next.find((l) => l.id === 'a')?.color).toBe('#1D9BF6')
    expect(next.find((l) => l.id === 'b')?.color).toBe('#111111')
  })

  it('clears a colour when given null', () => {
    const next = applyMutationToLists(lists, {
      id: 'm2',
      kind: 'setListProps',
      listId: 'b',
      color: null,
    })
    expect(next.find((l) => l.id === 'b')?.color).toBeUndefined()
  })

  it('changing the order does not disturb the colour', () => {
    const next = applyMutationToLists(lists, {
      id: 'm3',
      kind: 'setListProps',
      listId: 'b',
      order: 4,
    })
    const b = next.find((l) => l.id === 'b')
    expect(b?.order).toBe(4)
    expect(b?.color).toBe('#111111')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test apps/client/test/optimistic.test.ts`
Expected: FAIL — `setListProps` falls through to `default`, so nothing changes.

- [ ] **Step 3: Implement the optimistic case**

In `apps/client/src/sync/optimistic.ts`, add to `applyMutationToLists`, after the `renameList` case:

```ts
    // docs/specs/lists.md — colours and ordering. `null` clears a
    // property, `undefined` leaves it alone — so each field is applied
    // independently and changing one never disturbs the other.
    case 'setListProps':
      return lists.map((list) => {
        if (list.id !== mutation.listId) return list
        const next: TodoList = { ...list }
        if (mutation.color !== undefined) {
          if (mutation.color === null) delete next.color
          else next.color = mutation.color
        }
        if (mutation.order !== undefined) {
          if (mutation.order === null) delete next.order
          else next.order = mutation.order
        }
        return next
      })
```

- [ ] **Step 4: Delete the stale comment**

`apps/client/src/sync/optimistic.ts` lines 125-129 currently claim:

> "the server returns lists in collection (creation) order, not alphabetical, so the client renders them in that same order and never re-sorts"

That is **false** and contradicted by the correct comment 20 lines below it — the code sorts via `byDisplayName`. It predates the 2026-08-01 fix. Delete those five lines; the accurate comment inside the `createList` case stays.

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run test apps/client/test/optimistic.test.ts`
Expected: PASS.

- [ ] **Step 6: Add coalescing**

Add to `apps/client/test/coalesce.test.ts`:

```ts
// docs/specs/lists.md — nudging a list up three positions offline must
// queue one PROPPATCH, not three; and a colour change followed by a move
// must not lose the colour.
it('merges consecutive setListProps for the same list, field-wise', () => {
  const merged = coalesce([
    { id: 'm1', kind: 'setListProps', listId: 'a', color: '#1D9BF6' },
    { id: 'm2', kind: 'setListProps', listId: 'a', order: 2 },
    { id: 'm3', kind: 'setListProps', listId: 'a', order: 3 },
  ])
  expect(merged).toHaveLength(1)
  expect(merged[0]).toMatchObject({
    kind: 'setListProps',
    listId: 'a',
    color: '#1D9BF6',
    order: 3,
  })
})

it('does not merge across different lists', () => {
  const merged = coalesce([
    { id: 'm1', kind: 'setListProps', listId: 'a', order: 1 },
    { id: 'm2', kind: 'setListProps', listId: 'b', order: 2 },
  ])
  expect(merged).toHaveLength(2)
})
```

Run it, watch it fail, then implement the merge in `apps/client/src/sync/coalesce.ts` following the existing pattern for `updateTodo`. Later fields win per-field; `undefined` never overwrites a set value.

- [ ] **Step 7: Wire the API client**

In `apps/client/src/api/client.ts`, replace `renameList` and extend `createList`:

```ts
    createList: async (
      id: string,
      displayName: string,
      props?: { color?: string; order?: number },
    ): Promise<TodoList> =>
      todoListSchema.parse(
        await call('/api/lists', 'POST', { id, displayName, ...props }),
      ),
    /** docs/specs/lists.md — any subset of a list's mutable properties. */
    patchList: async (
      id: string,
      changes: {
        displayName?: string
        color?: string | null
        order?: number | null
      },
    ): Promise<void> => {
      await call(`/api/lists/${enc(id)}`, 'PATCH', changes)
    },
```

Update the `renameList` call site in `apps/client/src/sync/process.ts` to `patchList(listId, { displayName })`, and add the `setListProps` case:

```ts
    case 'setListProps':
      await api.patchList(mutation.listId, {
        ...(mutation.color !== undefined ? { color: mutation.color } : {}),
        ...(mutation.order !== undefined ? { order: mutation.order } : {}),
      })
      return
```

Also pass colour/order through the `createList` case if the mutation carries them.

- [ ] **Step 8: Verify and commit**

```bash
bun run fmt && bun run lint && bun run typecheck && bun run test
```

```bash
git add apps/client/src apps/client/test
git commit -m "feat(client): queue and apply list colour/order changes"
```

---

## Task 8: The contrast guard

A user's colour can be arbitrary. A pale one used as the selection marker would make the selected row read as barely selected.

**Files:**
- Create: `apps/client/src/lists/list-color.ts`
- Create: `apps/client/test/list-color.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { markerColor } from '../src/lists/list-color'

// docs/specs/lists.md — the contrast guard. The dot always carries the
// list's colour; the *marker* falls back to --accent when that colour is
// too close to the paper to read as a selection state.
describe('markerColor', () => {
  it('uses the list colour when it contrasts with the paper', () => {
    expect(markerColor('#1D9BF6', 'light')).toBe('#1D9BF6')
    expect(markerColor('#E8503A', 'light')).toBe('#E8503A')
  })

  it('falls back to the accent when a colour is too pale on light paper', () => {
    // Near-white on #faf9f6 paper: a marker nobody could see.
    expect(markerColor('#FFFEF8', 'light')).toBe('var(--accent)')
    expect(markerColor('#F5F4F0', 'light')).toBe('var(--accent)')
  })

  it('falls back when a colour is too dark on dark paper', () => {
    // Near-black on #17150f paper.
    expect(markerColor('#111111', 'dark')).toBe('var(--accent)')
  })

  it('accepts on dark paper what it rejects on light, and vice versa', () => {
    // A pale yellow is invisible on paper but fine on a dark page.
    expect(markerColor('#FFFEF8', 'light')).toBe('var(--accent)')
    expect(markerColor('#FFFEF8', 'dark')).toBe('#FFFEF8')
  })

  it('falls back when there is no colour at all', () => {
    expect(markerColor(undefined, 'light')).toBe('var(--accent)')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test apps/client/test/list-color.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/client/src/lists/list-color.ts`:

```ts
/**
 * The contrast guard — docs/specs/lists.md (colours).
 *
 * A list's colour is arbitrary: it can come from Apple Reminders, from a
 * hex field, or from a colour wheel. The **dot** always shows it as-is.
 * The **selection marker** is different — it has a job to do, and a colour
 * too close to the paper would make a selected row read as unselected.
 *
 * So the marker falls back to `--accent` when the list's colour doesn't
 * contrast enough with the current theme's paper. This is the only place
 * the app second-guesses a user's colour, and it never changes what is
 * stored — purely presentational.
 */

/** Paper luminance per theme — --paper in styles/tokens.css. */
const PAPER_LUMINANCE = {
  light: 0.965, // #faf9f6
  dark: 0.09, // #17150f
} as const

export type Theme = keyof typeof PAPER_LUMINANCE

/**
 * Minimum luminance gap from the paper. Chosen so a marker reads as a
 * deliberate mark rather than a smudge; well below a text-contrast
 * threshold, because this is a 4px bar, not a glyph.
 */
const MIN_DELTA = 0.28

const channel = (hex: string, at: number): number => {
  const value = Number.parseInt(hex.slice(at, at + 2), 16) / 255
  // sRGB → linear, per WCAG relative luminance.
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance of a `#RRGGBB` colour, 0..1. */
export function luminance(color: string): number {
  return (
    0.2126 * channel(color, 1) +
    0.7152 * channel(color, 3) +
    0.0722 * channel(color, 5)
  )
}

/**
 * What the selected row's left marker should be painted: the list's own
 * colour, or the accent token when that colour would disappear against the
 * paper. Returns a CSS value, ready to drop into a style property.
 */
export function markerColor(
  color: string | undefined,
  theme: Theme,
): string {
  if (!color) return 'var(--accent)'
  const delta = Math.abs(luminance(color) - PAPER_LUMINANCE[theme])
  return delta >= MIN_DELTA ? color : 'var(--accent)'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test apps/client/test/list-color.test.ts`
Expected: PASS, 5 tests.

If a threshold assertion fails, adjust `MIN_DELTA` — but keep the property the tests describe: obviously-visible colours pass, near-paper colours fall back, and the answer differs by theme.

- [ ] **Step 5: Verify and commit**

```bash
bun run fmt && bun run lint && bun run typecheck && bun run test
```

```bash
git add apps/client/src/lists/list-color.ts apps/client/test/list-color.test.ts
git commit -m "feat(client): fall back to the accent when a list colour is too pale"
```

---

## Task 9: Sort rule and next order

**Files:**
- Create: `apps/client/src/lists/list-order.ts`
- Create: `apps/client/test/list-order.test.ts`
- Modify: `apps/client/src/sync/engine.ts`
- Modify: `apps/client/src/sync/optimistic.ts`

- [ ] **Step 1: Write the failing test**

```ts
import type { TodoList } from '@fold/schemas'
import { describe, expect, it } from 'vitest'
import { byListOrder, nextOrder, reorder } from '../src/lists/list-order'

const list = (id: string, displayName: string, order?: number): TodoList => ({
  id,
  href: `/${id}/`,
  displayName,
  ctag: '1',
  ...(order !== undefined ? { order } : {}),
})

// docs/specs/lists.md — ordering: lists with an order sort by it; lists
// without sort alphabetically *after* them.
describe('byListOrder', () => {
  it('sorts ordered lists by their order', () => {
    const sorted = [list('c', 'C', 3), list('a', 'A', 1), list('b', 'B', 2)]
      .toSorted(byListOrder)
      .map((l) => l.id)
    expect(sorted).toEqual(['a', 'b', 'c'])
  })

  it('puts unordered lists after ordered ones, alphabetically', () => {
    const sorted = [
      list('z', 'Zebra'),
      list('m', 'Mango', 5),
      list('a', 'Apple'),
    ]
      .toSorted(byListOrder)
      .map((l) => l.id)
    expect(sorted).toEqual(['m', 'a', 'z'])
  })

  it('breaks an order tie alphabetically, so the sort is stable', () => {
    const sorted = [list('b', 'Beta', 1), list('a', 'Alpha', 1)]
      .toSorted(byListOrder)
      .map((l) => l.id)
    expect(sorted).toEqual(['a', 'b'])
  })

  it('ignores order 0 as a value, not as absent', () => {
    // A falsy order is still an order — `?? ` not `||`.
    const sorted = [list('b', 'B', 5), list('a', 'A', 0)]
      .toSorted(byListOrder)
      .map((l) => l.id)
    expect(sorted).toEqual(['a', 'b'])
  })
})

// docs/specs/lists.md — a new list must not jump: the client picks the
// order itself so the server never invents one to disagree with.
describe('nextOrder', () => {
  it('is one past the highest existing order', () => {
    expect(nextOrder([list('a', 'A', 1), list('b', 'B', 4)])).toBe(5)
  })

  it('starts at 1 when no list has an order yet', () => {
    expect(nextOrder([list('a', 'A'), list('b', 'B')])).toBe(1)
  })

  it('starts at 1 for an empty nav', () => {
    expect(nextOrder([])).toBe(1)
  })

  it('handles a negative order without going backwards', () => {
    expect(nextOrder([list('a', 'A', -3)])).toBe(-2)
  })
})

// docs/specs/lists.md — reordering writes only the lists that moved.
describe('reorder', () => {
  const lists = [list('a', 'A', 1), list('b', 'B', 2), list('c', 'C', 3)]

  it('swaps a list with the one above it', () => {
    expect(reorder(lists, 'b', 'up')).toEqual([
      { listId: 'b', order: 1 },
      { listId: 'a', order: 2 },
    ])
  })

  it('swaps a list with the one below it', () => {
    expect(reorder(lists, 'b', 'down')).toEqual([
      { listId: 'b', order: 3 },
      { listId: 'c', order: 2 },
    ])
  })

  it('does nothing at the top', () => {
    expect(reorder(lists, 'a', 'up')).toEqual([])
  })

  it('does nothing at the bottom', () => {
    expect(reorder(lists, 'c', 'down')).toEqual([])
  })

  it('assigns orders when neighbours have none', () => {
    // A nav of lists created by another client: nothing has an order yet,
    // so moving one has to give both a real number.
    const plain = [list('a', 'A'), list('b', 'B'), list('c', 'C')]
    const changes = reorder(plain, 'b', 'up')
    expect(changes).toHaveLength(2)
    const moved = changes.find((c) => c.listId === 'b')
    const displaced = changes.find((c) => c.listId === 'a')
    expect(moved!.order).toBeLessThan(displaced!.order)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test apps/client/test/list-order.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/client/src/lists/list-order.ts`:

```ts
import type { TodoList } from '@fold/schemas'

/**
 * List ordering — docs/specs/lists.md (ordering).
 *
 * Lists carrying Apple's `calendar-order` sort by it; lists without one
 * sort alphabetically *after* them. That second group exists because a
 * list created by another client may have no order at all, and because a
 * server may ignore the property entirely — in which case every list falls
 * into it and the nav is alphabetical, exactly as it was before this
 * feature (docs/specs/lists.md — degradation).
 */

const byName = (a: TodoList, b: TodoList): number =>
  a.displayName.localeCompare(b.displayName)

/** The one ordering rule, used on read and on optimistic insert alike. */
export const byListOrder = (a: TodoList, b: TodoList): number => {
  const aHas = a.order !== undefined
  const bHas = b.order !== undefined
  if (aHas && bHas) {
    // Non-null asserted: `aHas`/`bHas` already proved these are numbers,
    // and a 0 order is a real position (hence `!== undefined`, not `??`).
    const diff = a.order! - b.order!
    return diff !== 0 ? diff : byName(a, b)
  }
  if (aHas) return -1
  if (bHas) return 1
  return byName(a, b)
}

/**
 * The order to give a newly created list: one past the highest in use.
 *
 * The **client** picks this, not the server, so the two can never disagree
 * about where a new list belongs — the guarantee that a new list never
 * appears in one position and jumps to another when the response lands
 * (docs/specs/lists.md; this is the 2026-08-01 regression that must not
 * return).
 */
export function nextOrder(lists: readonly TodoList[]): number {
  const orders = lists
    .map((list) => list.order)
    .filter((order): order is number => order !== undefined)
  if (orders.length === 0) return 1
  return Math.max(...orders) + 1
}

export interface OrderChange {
  listId: string
  order: number
}

/**
 * Moving one list up or down: the orders that need writing, and nothing
 * else. Swapping two adjacent lists swaps two numbers — two PROPPATCHes,
 * not a renumber of the whole nav (docs/specs/lists.md — reordering writes
 * only what moved).
 *
 * Returns `[]` at either end, so the caller can disable the control.
 */
export function reorder(
  lists: readonly TodoList[],
  listId: string,
  direction: 'up' | 'down',
): OrderChange[] {
  const sorted = lists.toSorted(byListOrder)
  const index = sorted.findIndex((list) => list.id === listId)
  if (index === -1) return []
  const neighbourIndex = direction === 'up' ? index - 1 : index + 1
  const moved = sorted[index]
  const neighbour = sorted[neighbourIndex]
  if (!moved || !neighbour) return []

  // Both may be unordered — a nav built entirely by another client. Fall
  // back to their current positions, which the sort above already agrees
  // with, so the swap lands where the user expects.
  const movedOrder = moved.order ?? index + 1
  const neighbourOrder = neighbour.order ?? neighbourIndex + 1

  // If they tie (or both defaulted to the same number), force a gap so the
  // swap actually changes the sort rather than resolving to the same
  // alphabetical tiebreak.
  if (movedOrder === neighbourOrder) {
    return direction === 'up'
      ? [
          { listId: moved.id, order: movedOrder - 1 },
          { listId: neighbour.id, order: movedOrder },
        ]
      : [
          { listId: moved.id, order: movedOrder + 1 },
          { listId: neighbour.id, order: movedOrder },
        ]
  }

  return [
    { listId: moved.id, order: neighbourOrder },
    { listId: neighbour.id, order: movedOrder },
  ]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test apps/client/test/list-order.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Switch the app over to the new sort**

In `apps/client/src/sync/engine.ts`, `reconcileLists` currently ends `.toSorted(byDisplayName)`. Change the import and the call to `byListOrder`.

In `apps/client/src/sync/optimistic.ts`, the `createList` case ends `.toSorted(byDisplayName)` — change it to `byListOrder`. Give the placeholder its order so it doesn't land in the unordered group:

```ts
      const placeholder: TodoList = {
        id: mutation.listId,
        href: '',
        displayName: mutation.displayName,
        ctag: '',
        ...(mutation.order !== undefined ? { order: mutation.order } : {}),
      }
```

Add `order` to the `createList` mutation in `packages/schemas/src/mutation.ts`:

```ts
  z.object({
    ...base,
    kind: z.literal('createList'),
    listId,
    displayName: z.string().min(1),
    // docs/specs/lists.md — chosen by the client at creation so the new
    // list never jumps when the server responds.
    order: z.int().optional(),
    color: z
      .string()
      .regex(/^#[0-9A-F]{6}$/)
      .optional(),
  }),
```

Delete `byDisplayName` from `optimistic.ts` once nothing imports it, or keep it if `byListOrder` uses it — either way, there must be exactly one sort rule in the codebase.

- [ ] **Step 6: Update the existing ordering test**

`apps/client/test/optimistic.test.ts` has a test asserting alphabetical insert. Update it to the new rule: an ordered nav places the new list last by order; an unordered nav still sorts alphabetically.

- [ ] **Step 7: Verify and commit**

```bash
bun run fmt && bun run lint && bun run typecheck && bun run test
```

```bash
git add apps/client packages/schemas
git commit -m "feat(client): sort lists by calendar-order, alphabetical fallback"
```

---

## Task 10: The colour picker

**Files:**
- Create: `apps/client/src/lists/color-picker.tsx`
- Create: `apps/client/src/lists/color-picker.module.css`
- Modify: `apps/client/src/styles/tokens.css`

- [ ] **Step 1: Add the palette tokens**

In `apps/client/src/styles/tokens.css`, inside `:root`, after the status colours:

```css
  /* docs/specs/lists.md — colours: a restrained palette tuned to Fold's
     warm paper rather than borrowed from Apple. These are a *shortcut*,
     not a constraint — any hex is valid, and a colour set by another
     client renders exactly as stored. Deliberately muted: eight options
     that sit in the page rather than shouting off it. */
  --list-red: #a8564a;
  --list-orange: #b3703a;
  --list-amber: #a8863c;
  --list-green: #5d7f52;
  --list-teal: #4a7f78;
  --list-blue: #4a6f96;
  --list-violet: #7a5f8f;
  --list-rose: #9c5c72;
```

These are already dark enough to pass the contrast guard on light paper. They are literal values, not theme-dependent — a list's colour is stored on the server and must look the same in both themes.

- [ ] **Step 2: Write the component**

Create `apps/client/src/lists/color-picker.tsx`:

```tsx
import { parseListColor } from '@fold/schemas'
import { useId, useState } from 'react'
import { LuCheck, LuX } from 'react-icons/lu'
import { cx } from '../styles/cx'
import styles from './color-picker.module.css'

// docs/specs/lists.md — colours. The palette is a shortcut, not a
// constraint: the hex field is the truth, and a colour from another client
// renders exactly as stored even though it matches no swatch.
const PALETTE = [
  { name: 'Red', value: '#A8564A' },
  { name: 'Orange', value: '#B3703A' },
  { name: 'Amber', value: '#A8863C' },
  { name: 'Green', value: '#5D7F52' },
  { name: 'Teal', value: '#4A7F78' },
  { name: 'Blue', value: '#4A6F96' },
  { name: 'Violet', value: '#7A5F8F' },
  { name: 'Rose', value: '#9C5C72' },
] as const

export function ColorPicker(props: {
  value: string | undefined
  onChange: (color: string | undefined) => void
}) {
  const hexId = useId()
  // Kept separate from `value` so a half-typed hex ("#1D9") doesn't clear
  // the colour on every keystroke.
  const [draft, setDraft] = useState(props.value ?? '')

  const commit = (raw: string): void => {
    setDraft(raw)
    const parsed = parseListColor(raw)
    if (parsed) props.onChange(parsed)
    else if (raw.trim() === '') props.onChange(undefined)
  }

  return (
    <div className={styles['picker']}>
      <div className={styles['swatches']} role="group" aria-label="List colour">
        {PALETTE.map((entry) => (
          <button
            key={entry.value}
            type="button"
            className={styles['swatch']}
            style={{ background: entry.value }}
            aria-label={entry.name}
            aria-pressed={props.value === entry.value}
            onClick={() => {
              props.onChange(entry.value)
              setDraft(entry.value)
            }}
          >
            {props.value === entry.value && (
              <LuCheck aria-hidden="true" size={14} />
            )}
          </button>
        ))}
        <button
          type="button"
          className={cx(styles['swatch'], styles['none'])}
          aria-label="No colour"
          aria-pressed={props.value === undefined}
          onClick={() => {
            props.onChange(undefined)
            setDraft('')
          }}
        >
          <LuX aria-hidden="true" size={14} />
        </button>
      </div>

      <div className={styles['custom']}>
        <label className={styles['hexLabel']} htmlFor={hexId}>
          Custom
        </label>
        <input
          id={hexId}
          type="text"
          className={styles['hex']}
          placeholder="#7A5C3E"
          value={draft}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => commit(event.target.value)}
        />
        {/* A native colour input costs nothing and gives a real wheel on
            every platform — worth far more than a hand-rolled one. */}
        <input
          type="color"
          className={styles['wheel']}
          aria-label="Pick a colour"
          value={props.value ?? '#7A5C3E'}
          onChange={(event) => commit(event.target.value)}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write the styles**

Create `apps/client/src/lists/color-picker.module.css`:

```css
/*
 * docs/specs/lists.md — colours. A restrained palette as the default
 * path, with a hex field and a native wheel underneath for anything else.
 */
.picker {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

/* Round, so a swatch never reads as a button to be pressed — it reads as
   a colour to be chosen (docs/specs/ui.md — controls). */
.swatch {
  width: var(--hit-area);
  height: var(--hit-area);
  border-radius: var(--radius-full);
  border: var(--border-width) solid color-mix(in srgb, var(--ink) 12%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  cursor: pointer;
  transition: transform var(--duration-fast) var(--ease);
}

.swatch:hover {
  transform: scale(1.08);
}

.swatch:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 var(--border-width) var(--accent);
}

/* "No colour" — an empty ring, the same shape the nav uses for a list
   with no colour set, so the two read as the same idea. */
.none {
  background: transparent;
  color: var(--faint);
  border-style: dashed;
}

.custom {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.hexLabel {
  font-size: var(--text-sm);
  color: var(--muted);
}

.hex {
  flex: 1;
  min-width: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-transform: uppercase;
}

/* The native wheel, sized to match the hex field's height rather than the
   browser's default chunky swatch. */
.wheel {
  flex: none;
  width: var(--hit-area);
  height: var(--hit-area);
  padding: 0;
  border: var(--border-width) solid var(--line);
  border-radius: var(--radius-sm);
  background: none;
  cursor: pointer;
}
```

- [ ] **Step 4: Verify and commit**

```bash
bun run fmt && bun run lint && bun run typecheck
```

```bash
git add apps/client/src/lists/color-picker.tsx apps/client/src/lists/color-picker.module.css apps/client/src/styles/tokens.css
git commit -m "feat(client): a restrained palette with a hex field and wheel"
```

---

## Task 11: Colour in the list form

**Files:**
- Modify: `apps/client/src/lists/list-form.tsx`
- Modify: `apps/client/src/lists/list-form-modal.tsx`
- Modify: `apps/client/src/lists/list-nav.tsx`

- [ ] **Step 1: Extend the form**

`ListNameForm` now edits more than a name. Rename it `ListForm` and widen its contract so name and colour submit together as one edit:

```tsx
const listFormSchema = z.object({
  displayName: z.string().min(1),
  color: z
    .string()
    .regex(/^#[0-9A-F]{6}$/)
    .optional(),
})
type ListFormValues = z.infer<typeof listFormSchema>

export function ListForm(props: {
  initial?: { displayName: string; color?: string }
  submitLabel: string
  onSubmit: (values: ListFormValues) => void
  onCancel: () => void
}) {
  const { control, handleSubmit } = useForm<ListFormValues>({
    resolver: zodResolver(listFormSchema),
    defaultValues: {
      displayName: props.initial?.displayName ?? '',
      ...(props.initial?.color !== undefined
        ? { color: props.initial.color }
        : {}),
    },
  })
  // ...existing displayName Controller unchanged...
```

Add a colour field below the name, with the extension badge beside its label (the badge arrives in Task 14 — leave a plain label until then, and add the badge in that task):

```tsx
      <Controller
        name="color"
        control={control}
        render={({ field: { value, onChange } }) => (
          <div className={styles['field']}>
            <span className={styles['label']}>Colour</span>
            <ColorPicker value={value} onChange={onChange} />
          </div>
        )}
      />
```

- [ ] **Step 2: Thread it through the modal**

`ListFormModal` currently passes `initial` as a string and `onSubmit` as `(displayName: string)`. Change both to the object form and update its two call sites in `list-nav.tsx`.

- [ ] **Step 3: Emit the right mutations**

In `list-nav.tsx`, the create handler now supplies an order and a colour:

```tsx
        onSubmit={(values) => {
          const listId = slug()
          mutate({
            id: crypto.randomUUID(),
            kind: 'createList',
            listId,
            displayName: values.displayName,
            // docs/specs/lists.md — the client picks the order so the new
            // list can't jump when the server responds.
            order: nextOrder(lists.data ?? []),
            ...(values.color !== undefined ? { color: values.color } : {}),
          })
          setCreating(false)
          props.onSelect(listId)
        }}
```

And the rename handler becomes an edit handler, emitting up to two mutations — only for what actually changed:

```tsx
        onSubmit={(values) => {
          if (!renaming) return
          if (values.displayName !== renaming.displayName) {
            mutate({
              id: crypto.randomUUID(),
              kind: 'renameList',
              listId: renaming.id,
              displayName: values.displayName,
            })
          }
          if (values.color !== renaming.color) {
            mutate({
              id: crypto.randomUUID(),
              kind: 'setListProps',
              listId: renaming.id,
              // undefined means "cleared" here — the form uses undefined
              // for no-colour, the mutation uses null for "remove it".
              color: values.color ?? null,
            })
          }
          setRenaming(null)
        }}
```

Also retitle the modal: `title="Rename list"` becomes `title="Edit list"`, and `submitLabel="Rename"` becomes `"Save"`.

- [ ] **Step 4: Verify and commit**

```bash
bun run fmt && bun run lint && bun run typecheck && bun run test
```

Manually check in the browser (`bun run --filter @fold/client dev`): create a list with a colour, edit an existing list's colour, clear a colour.

```bash
git add apps/client/src/lists
git commit -m "feat(client): choose a list's colour when creating or editing it"
```

---

## Task 12: The dot and the coloured marker

**Files:**
- Modify: `apps/client/src/lists/list-nav.tsx`
- Modify: `apps/client/src/lists/list-nav.module.css`
- Create: `apps/client/src/use-theme.ts`

- [ ] **Step 1: Detect the theme**

The contrast guard needs to know which paper it is on. Create `apps/client/src/use-theme.ts`:

```ts
import { useMediaQuery } from './use-media-query'
import type { Theme } from './lists/list-color'

/**
 * Which paper the app is currently on — needed by the list-colour
 * contrast guard (docs/specs/lists.md). The app follows the OS setting
 * and has no in-app theme switch, so this is a single media query.
 */
export function useTheme(): Theme {
  return useMediaQuery('(prefers-color-scheme: dark)') ? 'dark' : 'light'
}
```

- [ ] **Step 2: Render the dot**

In `list-nav.tsx`, inside the list `<li>`, before the name:

```tsx
            <button
              type="button"
              className={
                list.id === props.selected
                  ? `${styles['link']} ${styles['linkActive']}`
                  : styles['link']
              }
              style={
                list.id === props.selected
                  ? { borderLeftColor: markerColor(list.color, theme) }
                  : undefined
              }
              onClick={() => props.onSelect(list.id)}
            >
              {/* docs/specs/lists.md — colours: every list gets a dot,
                  filled or not. An unfilled ring for a list with no colour
                  keeps every name on the same left edge and the row rhythm
                  identical down the nav; omitting it would make an
                  uncoloured list read as a different kind of row and shift
                  its name the moment a colour was assigned. */}
              <span
                className={cx(
                  styles['dot'],
                  list.color === undefined && styles['dotEmpty'],
                )}
                style={
                  list.color !== undefined
                    ? { background: list.color }
                    : undefined
                }
                aria-hidden="true"
              />
              {list.displayName}
            </button>
```

Add `const theme = useTheme()` at the top of the component, and import `markerColor` and `useTheme`.

- [ ] **Step 3: Style the dot**

Add to `list-nav.module.css`:

```css
/* docs/specs/lists.md — colours: an 8px dot before the name, in every
   state. Reuses the status dot's vocabulary (status-dot.module.css) so
   this costs no new visual concept. The dot answers "which list is
   this?"; the left marker answers "which one am I in?" — two questions,
   two signals, deliberately kept apart. */
.dot {
  width: var(--space-2);
  height: var(--space-2);
  border-radius: var(--radius-full);
  flex: none;
}

/* No colour set: an unfilled ring, not an absence. Same footprint as a
   filled dot, so names stay on one left edge whether or not a list has a
   colour, and assigning one never shifts the row. */
.dotEmpty {
  background: none;
  box-shadow: inset 0 0 0 var(--border-width) var(--faint);
}
```

Add `gap: var(--space-2);` to `.link` so the dot and label are spaced (it is already `display: flex`).

- [ ] **Step 4: Verify in the browser**

Run the dev server and check:
- A coloured list shows a filled dot; an uncoloured one shows a ring.
- Selecting a coloured list tints the left marker to that colour.
- Selecting a list with a very pale colour falls back to the accent marker.
- Names align identically whether or not a list has a colour.

Take a screenshot for the record.

- [ ] **Step 5: Write the e2e test**

Add to the e2e suite (same file as the reorder test in Task 13, or a new
`lists.spec.ts`):

```ts
test('a list colour persists across a reload', async ({ page }) => {
  // ...create a list via the existing helpers...
  // Open its kebab → Edit, pick a palette swatch, Save.
  // Assert the nav row's dot carries that colour:
  //   the dot is rendered with an inline `background`, so read it with
  //   toHaveCSS('background-color', 'rgb(74, 111, 150)') — Playwright
  //   reports computed colours as rgb(), never as the source hex.
  // Reload, assert the same colour again — that is what proves it
  // reached the server rather than only the cache.
})
```

Fill this in against the existing e2e helpers — do not invent new ones. Use
a palette swatch rather than typing a hex, so the test doesn't depend on
the hex field's parsing (that is already covered by unit tests, and
duplicating it here would break the no-duplication-across-layers rule).

- [ ] **Step 6: Run the e2e suite**

Run: `bun run test:e2e`
Expected: PASS.

- [ ] **Step 7: Verify and commit**

```bash
bun run fmt && bun run lint && bun run typecheck && bun run test
```

```bash
git add apps/client/src e2e
git commit -m "feat(client): show a list's colour in the nav"
```

---

## Task 13: Reordering

**Files:**
- Modify: `apps/client/src/lists/list-item-menu.tsx`
- Modify: `apps/client/src/lists/list-nav.tsx`

- [ ] **Step 1: Add the menu items**

`ListItemMenu` currently takes `onRename` and `onDelete`. Add `onMoveUp` / `onMoveDown`, plus `canMoveUp` / `canMoveDown` to disable them at the ends:

```tsx
export function ListItemMenu(props: {
  displayName: string
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onRename: () => void
  onDelete: () => void
})
```

Add two items above Rename, using `LuArrowUp` / `LuArrowDown` from `react-icons/lu`, following the existing items' markup exactly. Base UI's `Menu.Item` takes a `disabled` prop.

- [ ] **Step 2: Wire it in the nav**

In `list-nav.tsx`, the lists are already sorted by the query. Give the menu its position:

```tsx
        {(lists.data ?? []).map((list, index, all) => (
          <li key={list.id} className={styles['item']}>
            {/* ...link... */}
            <ListItemMenu
              displayName={list.displayName}
              canMoveUp={index > 0}
              canMoveDown={index < all.length - 1}
              onMoveUp={() => move(list.id, 'up')}
              onMoveDown={() => move(list.id, 'down')}
              onRename={() => setRenaming(list)}
              onDelete={() => setDeleting(list)}
            />
          </li>
        ))}
```

And the handler, which emits one mutation per list that actually moved:

```tsx
  // docs/specs/lists.md — reordering writes only the lists that moved:
  // swapping two adjacent lists swaps two numbers, rather than renumbering
  // the whole nav.
  const move = (listId: string, direction: 'up' | 'down'): void => {
    for (const change of reorder(lists.data ?? [], listId, direction)) {
      mutate({
        id: crypto.randomUUID(),
        kind: 'setListProps',
        listId: change.listId,
        order: change.order,
      })
    }
  }
```

- [ ] **Step 3: Verify in the browser**

With three or more lists: move one up, move one down, confirm the top list can't move up and the bottom can't move down, and confirm the order survives a page reload.

- [ ] **Step 4: Write the e2e test**

Add to `e2e/tests/happy-path.spec.ts` (or a new `lists.spec.ts` if that file is already long):

```ts
test('reordering a list survives a reload', async ({ page }) => {
  // ...create two lists via the existing helpers...
  // Open the second list's menu, click "Move up", assert the nav order,
  // reload, assert the same order again.
})
```

Fill this in against the existing e2e helpers — do not invent new ones. The assertion that matters is the order **after reload**, because that is what proves the order reached the server rather than only the cache.

- [ ] **Step 5: Run the e2e suite**

Run: `bun run test:e2e`
Expected: PASS.

- [ ] **Step 6: Verify and commit**

```bash
bun run fmt && bun run lint && bun run typecheck && bun run test
```

```bash
git add apps/client/src e2e
git commit -m "feat(client): move lists up and down in the nav"
```

**Drag and drop is explicitly optional** (docs/specs — ordering: "the buttons are the contract"). Only attempt it if everything above is green and it lands cheaply with `@dnd-kit/sortable`. If its Playwright test is flaky, delete the test and say so rather than chasing it.

---

## Task 14: The extension badge

**Files:**
- Create: `apps/client/src/extension-badge.tsx`
- Create: `apps/client/src/extension-badge.module.css`
- Modify: `apps/client/src/lists/list-form.tsx`

- [ ] **Step 1: Confirm the Base UI tooltip API**

Check the installed version's exports before writing the component:

```bash
ls node_modules/.bun/@base-ui*/node_modules/@base-ui/react/tooltip/ 2>/dev/null || find . -path "*@base-ui/react/tooltip*" -name "*.d.ts" | head
```

Match the parts to what is actually exported (`Provider`, `Root`, `Trigger`, `Portal`, `Positioner`, `Popup`, `Arrow`). The docs are at https://base-ui.com/react/components/tooltip.

- [ ] **Step 2: Write the component**

Create `apps/client/src/extension-badge.tsx`:

```tsx
import { Tooltip } from '@base-ui/react/tooltip'
import { LuInfo } from 'react-icons/lu'
import styles from './extension-badge.module.css'

/**
 * Marks a feature that relies on a CalDAV **extension** rather than RFC
 * 4791 — docs/specs/lists.md (colours and ordering).
 *
 * Generic on purpose: it takes its own text, so any future extension-backed
 * feature can reuse it rather than growing a second version.
 *
 * The trigger is a real button, not a bare icon: a tooltip is hover/focus
 * only, and hover does not exist on touch — so tapping must do something.
 * `onLearnMore` opens the help modal, which is the touch path and also the
 * keyboard path.
 */
export function ExtensionBadge(props: {
  /** What the tooltip says. One or two sentences. */
  children: React.ReactNode
  label: string
  onLearnMore?: () => void
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        className={styles['trigger']}
        aria-label={props.label}
        onClick={props.onLearnMore}
      >
        <LuInfo aria-hidden="true" size={14} />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner className={styles['positioner']} sideOffset={6}>
          <Tooltip.Popup className={styles['popup']}>
            {props.children}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
```

If Base UI requires a `Tooltip.Provider` ancestor, add one in `apps/client/src/providers.tsx` rather than wrapping each badge.

- [ ] **Step 3: Write the styles**

Create `apps/client/src/extension-badge.module.css`:

```css
/* docs/specs/ui.md — overlays: a tooltip is the quietest surface in the
   app, so it borrows the popup treatment from the select menu rather than
   inventing its own. */
.trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--faint);
  background: none;
  border: none;
  padding: var(--space-1);
  cursor: help;
  border-radius: var(--radius-full);
}

.trigger:hover {
  color: var(--muted);
}

.trigger:focus-visible {
  outline: none;
  color: var(--accent);
  box-shadow: 0 0 0 var(--border-width) var(--accent);
}

.positioner {
  z-index: 60;
}

.popup {
  max-width: 18rem;
  background: var(--surface);
  color: var(--muted);
  border: var(--border-width) solid var(--line);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.12);
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-sm);
  line-height: var(--line-normal);
}
```

- [ ] **Step 4: Use it**

In `list-form.tsx`, beside the Colour label:

```tsx
            <span className={styles['label']}>
              Colour
              <ExtensionBadge label="About list colours">
                Colours use a CalDAV extension, not the core standard. Most
                servers support it; one that doesn't will ignore the colour
                rather than fail.
              </ExtensionBadge>
            </span>
```

- [ ] **Step 5: Verify and commit**

```bash
bun run fmt && bun run lint && bun run typecheck
```

Check in the browser that the tooltip opens on hover and on keyboard focus.

```bash
git add apps/client/src
git commit -m "feat(client): a reusable badge for extension-backed features"
```

---

## Task 15: The help modal

**Files:**
- Create: `apps/client/src/help-modal.tsx`
- Create: `apps/client/src/help-modal.module.css`
- Modify: `apps/client/src/main-screen.tsx`
- Modify: `apps/client/src/lists/nav-footer.tsx`

- [ ] **Step 1: Write the modal**

Create `apps/client/src/help-modal.tsx`, modelled on `settings-modal.tsx` — read that file first and match its `Dialog` structure, backdrop and popup classes exactly.

Content, deliberately short (`docs/user/` carries the depth):

- **Today and Summary** — derived views, not lists on the server.
- **Todos** — due dates and optional times, priority, and the metadata footer.
- **Lists** — one CalDAV collection each.
- **Colours and ordering** — the palette is a shortcut; any hex works; colours set in another app are shown as-is and never rewritten.
- **Offline** — changes queue and sync when the connection returns.
- **Server extensions** — the section the badges link to:

```tsx
        <section className={styles['section']}>
          <h3 className={styles['heading']}>Server extensions</h3>
          <p>
            Colours and ordering aren't part of the core CalDAV standard.
            They use two properties Apple introduced —{' '}
            <code>calendar-color</code> and <code>calendar-order</code> —
            which most servers support, including Radicale.
          </p>
          <p>
            A server that doesn't support them will ignore them rather than
            fail. Colours simply won't appear, and lists will fall back to
            alphabetical order.
          </p>
          <p>
            Colours are stored in the eight-digit form other clients write
            (<code>#1D9BF6FF</code>), so a colour you set here shows up in
            Apple Reminders and vice versa.
          </p>
        </section>
```

- [ ] **Step 2: Add the trigger**

In `nav-footer.tsx`, add a `?` button beside Settings using `LuCircleHelp`, matching the Settings button's markup and classes.

**Important:** hoist `helpOpen` state to `main-screen.tsx` and render `<HelpModal>` as a sibling of the drawer, exactly as `settingsOpen` is. Base UI suppresses a nested dialog's backdrop, and on mobile the footer renders inside the drawer's `Dialog.Popup` — a modal owned there would silently lose its scrim and click-outside-to-close. This is a bug that has already been fixed once for Settings; do not reintroduce it.

- [ ] **Step 3: Verify and commit**

Check on both a desktop and a mobile viewport that the modal has a backdrop and closes on outside click.

```bash
bun run fmt && bun run lint && bun run typecheck && bun run test
```

```bash
git add apps/client/src
git commit -m "feat(client): an in-app help modal"
```

---

## Task 16: Documentation

**Files:**
- Modify: `docs/specs/lists.md`
- Modify: `docs/specs/ui.md`
- Modify: `docs/specs/caldav-compliance.md`
- Modify: `docs/specs/backlog.md`
- Create: `docs/user/colours-and-ordering.md`

- [ ] **Step 1: Rewrite the ordering section of `docs/specs/lists.md`**

The current section says lists sort alphabetically and cites the 2026-08-01 regression. Replace it with the new rule, **keeping the regression note** — it explains why the anti-jump guarantee exists and must survive:

```markdown
## Ordering

Lists carrying Apple's `calendar-order` sort by it, ascending. Lists
without one sort alphabetically **after** them.

A new list's order is chosen by the **client** as `max(existing) + 1`,
applied optimistically and sent to the server in the MKCALENDAR. The server
never invents an order, so the two can't disagree about where a new list
goes.

*(This is the anti-jump guarantee. On 2026-08-01 a new list appeared at one
position and jumped when the server responded; the fix then was to sort
alphabetically on both sides. Ordering replaces that mechanism but must
preserve the property — any future change here has to keep the client and
server from disagreeing about a new list's position.)*

Reordering writes only the lists that moved: swapping two adjacent lists
swaps two numbers, not a renumber of the nav.

**Degradation.** `calendar-order` is an extension, not RFC 4791. A server
that ignores it returns lists with no order, which then sort alphabetically
— the previous behaviour, visibly rather than silently.
```

Add a Colours section covering the palette, the 8-digit round-trip, the contrast guard, and the "never rewrite what we didn't set" rule.

- [ ] **Step 2: Update `docs/specs/ui.md`**

Add to the nav section: the dot (filled or ring), and that the selection marker takes the list's colour unless the contrast guard falls back. Note the tooltip and help modal under overlays.

- [ ] **Step 3: Update `docs/specs/caldav-compliance.md`**

Add both properties to the list of what Fold reads and writes, marked as extensions, with the degradation rule.

- [ ] **Step 4: Update `docs/specs/backlog.md`**

Mark items 4 and 5 done, dated, in the same style as items 1 and 2:

```markdown
## ~~4. Reordering lists~~ — done 2026-08-03

## ~~5. Per-list colours~~ — done 2026-08-03
```

Keep the pointer to the design doc. **Leave item 6 (derived-view rows) open** — colours on Today/Summary rows were deliberately deferred.

- [ ] **Step 5: Write `docs/user/colours-and-ordering.md`**

The depth the help modal summarizes: how to set a colour, that any hex works, that colours are shared with other CalDAV clients, how to reorder, and what happens on a server that doesn't support the extensions.

- [ ] **Step 6: Commit**

```bash
bun run fmt
git add docs
git commit -m "docs: list colours and ordering"
```

---

## Task 17: Full verification

- [ ] **Step 1: Run everything**

```bash
bun run fmt:check && bun run lint && bun run typecheck && bun run test && bun run test:integration && bun run test:e2e
```

All must pass. Report actual output — if something fails, say so rather than describing the intent.

- [ ] **Step 2: Check against the user's real data**

The user's own Radicale holds their real list ("Bueno"). Verify against it in the browser:

- The existing list still appears, with no colour, showing an empty ring.
- Setting a colour on it persists across a reload.
- Reordering persists across a reload.

**Never toggle a completed todo** — that destroys its `COMPLETED` timestamp irreversibly, which is exactly the history the Summary view is built from.

- [ ] **Step 3: Confirm the stored form on the server**

Read the collection's props file directly and confirm the colour is stored in the 8-digit form other clients expect:

```bash
grep -r "calendar-color\|calendar-order" radicale-data/collections/collection-root/testuser/*/.Radicale.props
```

Expected: `#RRGGBBFF` and an integer.
