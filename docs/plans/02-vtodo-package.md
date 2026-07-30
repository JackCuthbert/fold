# Plan 02: `packages/vtodo` — VTODO Codec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tested, publishable package that reads VTODOs into our model, creates new VTODO resources, and applies edits via mutate-preserve — never destroying properties it doesn't manage.

**Architecture:** Wraps ical.js. `readTodo` maps iCalendar → `VtodoData`; `createTodoIcs` builds a fresh VCALENDAR; `applyChanges` parses an existing resource, mutates only managed properties, and reserializes — the spec-compliance cornerstone ([caldav-compliance](../specs/caldav-compliance.md), [todos](../specs/todos.md)). Time (`now`) is always injected for determinism.

**Tech Stack:** ical.js v2 (ships its own types), zod types from `@caldav-todo/schemas`, vitest.

---

### Task 1: Package scaffold

**Files:**
- Create: `packages/vtodo/package.json`, `packages/vtodo/tsconfig.json`,
  `packages/vtodo/src/error.ts`

- [ ] **Step 1: Scaffold**

`packages/vtodo/package.json`:

```json
{
  "name": "@caldav-todo/vtodo",
  "version": "0.1.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit" },
  "dependencies": {
    "@caldav-todo/schemas": "workspace:*",
    "ical.js": "^2.1.0"
  },
  "devDependencies": { "typescript": "^7.0.0", "vitest": "^3.0.0" }
}
```

`packages/vtodo/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

`packages/vtodo/src/error.ts`:

```ts
export class VtodoError extends Error {
  override name = 'VtodoError'
}
```

Run: `bun install`
Expected: workspace links resolve.

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "chore(vtodo): package scaffold"
```

---

### Task 2: Priority mapping

Behavior per [todos](../specs/todos.md): writes 1/5/9; reads 1–4 → high,
5 → medium, 6–9 → low; absent/0/garbage → none.

**Files:**
- Create: `packages/vtodo/src/priority.ts`
- Test: `packages/vtodo/test/priority.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/vtodo/test/priority.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { priorityFromNumber, priorityToNumber } from '../src/priority'

describe('priorityFromNumber', () => {
  it.each([
    [1, 'high'],
    [4, 'high'],
    [5, 'medium'],
    [6, 'low'],
    [9, 'low'],
  ])('maps %i to %s', (num, label) => {
    expect(priorityFromNumber(num)).toBe(label)
  })

  it.each([[0], [10], [-1], [2.5], ['5'], [undefined], [null]])(
    'maps %o to undefined',
    (num) => {
      expect(priorityFromNumber(num)).toBeUndefined()
    },
  )
})

describe('priorityToNumber', () => {
  it('round-trips through priorityFromNumber', () => {
    for (const label of ['high', 'medium', 'low'] as const) {
      expect(priorityFromNumber(priorityToNumber(label))).toBe(label)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- packages/vtodo`
Expected: FAIL — cannot resolve `../src/priority`.

- [ ] **Step 3: Implement**

`packages/vtodo/src/priority.ts`:

```ts
import type { TodoPriority } from '@caldav-todo/schemas'

const WRITE: Record<TodoPriority, number> = { high: 1, medium: 5, low: 9 }

export function priorityToNumber(priority: TodoPriority): number {
  return WRITE[priority]
}

export function priorityFromNumber(value: unknown): TodoPriority | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value)) return undefined
  if (value < 1 || value > 9) return undefined
  if (value <= 4) return 'high'
  if (value === 5) return 'medium'
  return 'low'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- packages/vtodo`
Expected: PASS.

- [ ] **Step 5: Lint, format, commit**

```bash
bun run lint && bun run fmt
git add -A && git commit -m "feat(vtodo): priority mapping"
```

---

### Task 3: Time helpers + `readTodo`

**Files:**
- Create: `packages/vtodo/src/time.ts`, `packages/vtodo/src/read.ts`
- Create: `packages/vtodo/test/fixtures/simple.ics`,
  `packages/vtodo/test/fixtures/full.ics`,
  `packages/vtodo/test/fixtures/event-only.ics`
- Test: `packages/vtodo/test/read.test.ts`

- [ ] **Step 1: Write fixtures**

`packages/vtodo/test/fixtures/simple.ics`:

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Some Other Client//EN
BEGIN:VTODO
UID:simple-1
DTSTAMP:20260701T120000Z
SUMMARY:Buy milk
END:VTODO
END:VCALENDAR
```

`packages/vtodo/test/fixtures/full.ics` (note the folded DESCRIPTION —
the second line starts with a single space):

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Some Other Client//EN
BEGIN:VTODO
UID:full-1
DTSTAMP:20260701T120000Z
SUMMARY:Plan trip
DESCRIPTION:A very long description that has been folded across multiple
 physical lines per RFC 5545 section 3.1 folding rules
STATUS:COMPLETED
PERCENT-COMPLETE:100
COMPLETED:20260702T080000Z
DUE;VALUE=DATE:20260710
PRIORITY:5
END:VTODO
END:VCALENDAR
```

`packages/vtodo/test/fixtures/event-only.ics`:

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Some Other Client//EN
BEGIN:VEVENT
UID:not-a-todo
DTSTAMP:20260701T120000Z
DTSTART:20260801T090000Z
SUMMARY:A meeting
END:VEVENT
END:VCALENDAR
```

(ical.js accepts LF fixtures; it serializes CRLF.)

- [ ] **Step 2: Write the failing test**

`packages/vtodo/test/read.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readTodo } from '../src/read'

const fixture = (name: string): string =>
  readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8')

describe('readTodo', () => {
  it('reads a minimal todo as incomplete', () => {
    const todo = readTodo(fixture('simple.ics'))
    expect(todo).toMatchObject({
      uid: 'simple-1',
      summary: 'Buy milk',
      completed: false,
    })
    expect(todo?.due).toBeUndefined()
    expect(todo?.priority).toBeUndefined()
  })

  it('reads status, date-only due, priority, folded description', () => {
    const todo = readTodo(fixture('full.ics'))
    expect(todo).toMatchObject({
      uid: 'full-1',
      completed: true,
      due: { kind: 'date', value: '2026-07-10' },
      priority: 'medium',
    })
    expect(todo?.description).toContain('folded across multiple physical')
  })

  it('returns null when there is no VTODO', () => {
    expect(readTodo(fixture('event-only.ics'))).toBeNull()
  })

  it('returns null for unparseable input', () => {
    expect(readTodo('not an ics file')).toBeNull()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun run test -- packages/vtodo`
Expected: FAIL — cannot resolve `../src/read`.

- [ ] **Step 4: Implement**

`packages/vtodo/src/time.ts`:

```ts
import type { TodoDue } from '@caldav-todo/schemas'
import ICAL from 'ical.js'

export function icalTimeFromDate(date: Date): ICAL.Time {
  return ICAL.Time.fromJSDate(date, true)
}

const pad = (value: number, width = 2): string =>
  String(value).padStart(width, '0')

/** Wall-clock components, with no zone interpretation whatsoever. */
const wallClock = (time: ICAL.Time): string =>
  `${pad(time.year, 4)}-${pad(time.month)}-${pad(time.day)}` +
  `T${pad(time.hour)}:${pad(time.minute)}:${pad(time.second)}`

/**
 * Read a DUE property, preserving which of the four RFC 5545 forms it used.
 * Takes the property (not just the value) because TZID lives in a parameter.
 * See docs/specs/todos.md#due-dates-and-timezones.
 */
export function dueFromProperty(property: ICAL.Property): TodoDue | null {
  const time = property.getFirstValue()
  if (!(time instanceof ICAL.Time)) return null
  if (time.isDate) return { kind: 'date', value: wallClock(time).slice(0, 10) }

  const tzid = property.getParameter('tzid')
  if (typeof tzid === 'string' && tzid !== '') {
    return { kind: 'zoned', tzid, value: wallClock(time) }
  }
  // ical.js reports a genuine `Z` suffix as the UTC zone; anything else
  // (including a TZID it could not resolve) parses as floating.
  if (time.zone === ICAL.Timezone.utcTimezone) {
    return { kind: 'utc', value: `${wallClock(time)}.000Z` }
  }
  return { kind: 'floating', value: wallClock(time) }
}

/** Write a DUE back in exactly the form it was read in. */
export function setDueOnComponent(
  vtodo: ICAL.Component,
  due: TodoDue,
): void {
  vtodo.removeProperty('due')
  const property = new ICAL.Property('due', vtodo)

  if (due.kind === 'date') {
    property.setValue(ICAL.Time.fromDateString(due.value))
    property.setParameter('value', 'DATE')
    vtodo.addProperty(property)
    return
  }

  const time = ICAL.Time.fromString(
    due.kind === 'utc' ? `${due.value.slice(0, 19)}Z` : due.value,
  )
  if (due.kind === 'zoned') property.setParameter('tzid', due.tzid)
  property.setValue(time)
  vtodo.addProperty(property)
}
```

**Note on `zoned` values:** we deliberately do NOT register a timezone or
resolve the `TZID` to an instant — the `TZID` parameter and wall-clock
components are carried through verbatim, so a zone we don't understand still
round-trips. Any `VTIMEZONE` component in the resource is preserved by the
same mutate-preserve mechanism as every other unmanaged component.

`packages/vtodo/src/read.ts`:

```ts
import type { TodoDue, TodoPriority } from '@caldav-todo/schemas'
import ICAL from 'ical.js'
import { priorityFromNumber } from './priority'
import { dueFromProperty } from './time'

export interface VtodoData {
  uid: string
  summary: string
  completed: boolean
  due?: TodoDue
  description?: string
  priority?: TodoPriority
}

export function readTodo(ics: string): VtodoData | null {
  let root: ICAL.Component
  try {
    root = new ICAL.Component(ICAL.parse(ics))
  } catch {
    return null
  }
  const vtodo = root.getFirstSubcomponent('vtodo')
  if (!vtodo) return null

  const uid = vtodo.getFirstPropertyValue('uid')
  if (typeof uid !== 'string' || uid === '') return null

  const summary = vtodo.getFirstPropertyValue('summary')
  const description = vtodo.getFirstPropertyValue('description')
  const dueProperty = vtodo.getFirstProperty('due')
  const due = dueProperty ? (dueFromProperty(dueProperty) ?? undefined) : undefined
  const priority = priorityFromNumber(
    vtodo.getFirstPropertyValue('priority'),
  )

  return {
    uid,
    summary: typeof summary === 'string' ? summary : '',
    completed: vtodo.getFirstPropertyValue('status') === 'COMPLETED',
    ...(due ? { due } : {}),
    ...(typeof description === 'string' && description !== ''
      ? { description }
      : {}),
    ...(priority ? { priority } : {}),
  }
}
```

(The conditional spreads matter: `@tsconfig/strictest` enables
`exactOptionalPropertyTypes`.)

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run test -- packages/vtodo`
Expected: PASS (all read tests + priority tests).

- [ ] **Step 6: Lint, format, commit**

```bash
bun run lint && bun run fmt
git add -A && git commit -m "feat(vtodo): readTodo with due/priority mapping"
```

---

### Task 4: `createTodoIcs`

**Files:**
- Create: `packages/vtodo/src/create.ts`
- Test: `packages/vtodo/test/create.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/vtodo/test/create.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createTodoIcs } from '../src/create'
import { readTodo } from '../src/read'

const NOW = new Date('2026-07-30T10:00:00Z')

describe('createTodoIcs', () => {
  it('creates an ics that reads back with the same data', () => {
    const ics = createTodoIcs(
      {
        uid: 'new-1',
        summary: 'Water plants',
        due: { kind: 'date', value: '2026-08-01' },
        priority: 'high',
        description: 'The ferns too',
      },
      NOW,
    )
    expect(readTodo(ics)).toEqual({
      uid: 'new-1',
      summary: 'Water plants',
      completed: false,
      due: { kind: 'date', value: '2026-08-01' },
      priority: 'high',
      description: 'The ferns too',
    })
  })

  it('is deterministic for a fixed now', () => {
    const a = createTodoIcs({ uid: 'x', summary: 'a' }, NOW)
    const b = createTodoIcs({ uid: 'x', summary: 'a' }, NOW)
    expect(a).toBe(b)
    expect(a).toContain('DTSTAMP:20260730T100000Z')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- packages/vtodo`
Expected: FAIL — cannot resolve `../src/create`.

- [ ] **Step 3: Implement**

`packages/vtodo/src/create.ts`:

```ts
import type { NewTodo } from '@caldav-todo/schemas'
import ICAL from 'ical.js'
import { priorityToNumber } from './priority'
import { icalTimeFromDate, setDueOnComponent } from './time'

const PRODID = '-//caldav-todo-client//EN'

export function createTodoIcs(input: NewTodo, now: Date): string {
  const root = new ICAL.Component(['vcalendar', [], []])
  root.updatePropertyWithValue('prodid', PRODID)
  root.updatePropertyWithValue('version', '2.0')

  const vtodo = new ICAL.Component('vtodo')
  vtodo.updatePropertyWithValue('uid', input.uid)
  vtodo.updatePropertyWithValue('dtstamp', icalTimeFromDate(now))
  vtodo.updatePropertyWithValue('summary', input.summary)
  vtodo.updatePropertyWithValue('status', 'NEEDS-ACTION')
  if (input.due) {
    setDueOnComponent(vtodo, input.due)
  }
  if (input.description !== undefined) {
    vtodo.updatePropertyWithValue('description', input.description)
  }
  if (input.priority) {
    vtodo.updatePropertyWithValue(
      'priority',
      priorityToNumber(input.priority),
    )
  }
  root.addSubcomponent(vtodo)
  return root.toString()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- packages/vtodo`
Expected: PASS.

- [ ] **Step 5: Lint, format, commit**

```bash
bun run lint && bun run fmt
git add -A && git commit -m "feat(vtodo): createTodoIcs"
```

---

### Task 5: `applyChanges` — managed-property mutation

**Files:**
- Create: `packages/vtodo/src/update.ts`, `packages/vtodo/src/index.ts`
- Test: `packages/vtodo/test/update.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/vtodo/test/update.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readTodo } from '../src/read'
import { applyChanges } from '../src/update'

const NOW = new Date('2026-07-30T10:00:00Z')
const fixture = (name: string): string =>
  readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8')

describe('applyChanges', () => {
  it('changes the summary and stamps the edit', () => {
    const out = applyChanges(
      fixture('simple.ics'),
      { summary: 'Buy oat milk' },
      NOW,
    )
    expect(readTodo(out)?.summary).toBe('Buy oat milk')
    expect(out).toContain('LAST-MODIFIED:20260730T100000Z')
    expect(out).toContain('SEQUENCE:1')
  })

  it('increments an existing SEQUENCE', () => {
    const once = applyChanges(fixture('simple.ics'), { summary: 'a' }, NOW)
    const twice = applyChanges(once, { summary: 'b' }, NOW)
    expect(twice).toContain('SEQUENCE:2')
  })

  it('completing writes STATUS, PERCENT-COMPLETE and COMPLETED', () => {
    const out = applyChanges(fixture('simple.ics'), { completed: true }, NOW)
    expect(readTodo(out)?.completed).toBe(true)
    expect(out).toContain('PERCENT-COMPLETE:100')
    expect(out).toContain('COMPLETED:20260730T100000Z')
  })

  it('un-completing removes COMPLETED and PERCENT-COMPLETE', () => {
    const out = applyChanges(fixture('full.ics'), { completed: false }, NOW)
    expect(readTodo(out)?.completed).toBe(false)
    expect(out).not.toContain('PERCENT-COMPLETE')
    expect(out).not.toContain('COMPLETED:')
  })

  it('null clears due, description and priority', () => {
    const out = applyChanges(
      fixture('full.ics'),
      { due: null, description: null, priority: null },
      NOW,
    )
    const todo = readTodo(out)
    expect(todo?.due).toBeUndefined()
    expect(todo?.description).toBeUndefined()
    expect(todo?.priority).toBeUndefined()
  })

  it.each([
    [{ kind: 'utc', value: '2026-08-01T09:30:00.000Z' }],
    [{ kind: 'floating', value: '2026-08-01T09:30:00' }],
    [
      {
        kind: 'zoned',
        tzid: 'Australia/Brisbane',
        value: '2026-08-01T09:30:00',
      },
    ],
  ])('round-trips a %o due unchanged', (due) => {
    const out = applyChanges(fixture('simple.ics'), { due }, NOW)
    expect(readTodo(out)?.due).toEqual(due)
  })

  it('throws VtodoError when there is no VTODO', () => {
    expect(() =>
      applyChanges(fixture('event-only.ics'), { summary: 'x' }, NOW),
    ).toThrowError('no VTODO component')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- packages/vtodo`
Expected: FAIL — cannot resolve `../src/update`.

- [ ] **Step 3: Implement**

`packages/vtodo/src/update.ts`:

```ts
import type { TodoChanges } from '@caldav-todo/schemas'
import ICAL from 'ical.js'
import { VtodoError } from './error'
import { priorityToNumber } from './priority'
import { icalTimeFromDate, setDueOnComponent } from './time'

// Mutate ONLY managed properties; everything else is preserved verbatim.
// See docs/specs/caldav-compliance.md (round-trip preservation).
export function applyChanges(
  ics: string,
  changes: TodoChanges,
  now: Date,
): string {
  let root: ICAL.Component
  try {
    root = new ICAL.Component(ICAL.parse(ics))
  } catch (cause) {
    throw new VtodoError('unparseable iCalendar data', { cause })
  }
  const vtodo = root.getFirstSubcomponent('vtodo')
  if (!vtodo) throw new VtodoError('no VTODO component')

  if (changes.summary !== undefined) {
    vtodo.updatePropertyWithValue('summary', changes.summary)
  }
  if (changes.description !== undefined) {
    if (changes.description === null) vtodo.removeProperty('description')
    else vtodo.updatePropertyWithValue('description', changes.description)
  }
  if (changes.due !== undefined) {
    if (changes.due === null) vtodo.removeProperty('due')
    else setDueOnComponent(vtodo, changes.due)
  }
  if (changes.priority !== undefined) {
    if (changes.priority === null) vtodo.removeProperty('priority')
    else {
      vtodo.updatePropertyWithValue(
        'priority',
        priorityToNumber(changes.priority),
      )
    }
  }
  if (changes.completed !== undefined) {
    if (changes.completed) {
      vtodo.updatePropertyWithValue('status', 'COMPLETED')
      vtodo.updatePropertyWithValue('percent-complete', 100)
      vtodo.updatePropertyWithValue('completed', icalTimeFromDate(now))
    } else {
      vtodo.updatePropertyWithValue('status', 'NEEDS-ACTION')
      vtodo.removeProperty('completed')
      vtodo.removeProperty('percent-complete')
    }
  }

  const sequence = vtodo.getFirstPropertyValue('sequence')
  const next = typeof sequence === 'number' ? sequence + 1 : 1
  vtodo.updatePropertyWithValue('sequence', next)
  const stamp = icalTimeFromDate(now)
  vtodo.updatePropertyWithValue('dtstamp', stamp)
  vtodo.updatePropertyWithValue('last-modified', stamp)

  return root.toString()
}
```

`packages/vtodo/src/index.ts`:

```ts
export { createTodoIcs } from './create'
export { VtodoError } from './error'
export { readTodo, type VtodoData } from './read'
export { applyChanges } from './update'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- packages/vtodo`
Expected: PASS.

- [ ] **Step 5: Lint, format, commit**

```bash
bun run lint && bun run fmt
git add -A && git commit -m "feat(vtodo): applyChanges mutate-preserve"
```

---

### Task 6: Preservation guarantees

The tests that back "never destroys data it does not understand"
([caldav-compliance](../specs/caldav-compliance.md)).

**Files:**
- Create: `packages/vtodo/test/fixtures/foreign.ics`,
  `packages/vtodo/test/fixtures/multi.ics`
- Test: `packages/vtodo/test/preservation.test.ts`

- [ ] **Step 1: Write fixtures**

`packages/vtodo/test/fixtures/foreign.ics`:

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Some Other Client//EN
X-WR-CALNAME:Chores
BEGIN:VTODO
UID:foreign-1
DTSTAMP:20260701T120000Z
SUMMARY:Water garden
RRULE:FREQ=WEEKLY;BYDAY=SA
RELATED-TO:parent-uid-1
X-FANCY-PROP;X-PARAM=yes:keep-me
CATEGORIES:home,garden
BEGIN:VALARM
ACTION:DISPLAY
TRIGGER:-PT15M
DESCRIPTION:Water garden
END:VALARM
END:VTODO
END:VCALENDAR
```

`packages/vtodo/test/fixtures/multi.ics`:

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Some Other Client//EN
BEGIN:VTODO
UID:multi-main
DTSTAMP:20260701T120000Z
SUMMARY:Main todo
END:VTODO
BEGIN:VTODO
UID:multi-sibling
DTSTAMP:20260701T120000Z
SUMMARY:Sibling todo
X-SIBLING-PROP:untouched
END:VTODO
END:VCALENDAR
```

- [ ] **Step 2: Write the failing test**

`packages/vtodo/test/preservation.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ICAL from 'ical.js'
import { describe, expect, it } from 'vitest'
import { applyChanges } from '../src/update'

const NOW = new Date('2026-07-30T10:00:00Z')
const fixture = (name: string): string =>
  readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8')

describe('round-trip preservation', () => {
  it('preserves alarms, x-props, rrule, related-to and categories', () => {
    const out = applyChanges(
      fixture('foreign.ics'),
      { summary: 'Water garden thoroughly' },
      NOW,
    )
    expect(out).toContain('BEGIN:VALARM')
    expect(out).toContain('TRIGGER:-PT15M')
    expect(out).toContain('X-FANCY-PROP;X-PARAM=yes:keep-me')
    expect(out).toContain('RRULE:FREQ=WEEKLY;BYDAY=SA')
    expect(out).toContain('RELATED-TO:parent-uid-1')
    expect(out).toContain('CATEGORIES:home,garden')
    expect(out).toContain('X-WR-CALNAME:Chores')
  })

  it.each([
    ['DUE:20260810T090000', 'floating'],
    ['DUE;TZID=Australia/Brisbane:20260810T090000', 'zoned'],
    ['DUE;TZID=Nowhere/Unknown:20260810T090000', 'unresolvable zone'],
  ])(
    'preserves a foreign %s (%s) when editing another field',
    (dueLine) => {
      const ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Another Client//EN',
        'BEGIN:VTODO',
        'UID:tz-1',
        'DTSTAMP:20260701T120000Z',
        'SUMMARY:Original',
        dueLine,
        'END:VTODO',
        'END:VCALENDAR',
      ].join('\r\n')
      const out = applyChanges(ics, { summary: 'Edited' }, NOW)
      // The DUE line must survive byte-equivalent — no zone conversion,
      // no Z suffix appearing, no host-offset shift.
      expect(out).toContain(dueLine)
    },
  )

  it('only touches the first VTODO in a multi-todo resource', () => {
    const out = applyChanges(fixture('multi.ics'), { summary: 'Edited' }, NOW)
    const root = new ICAL.Component(ICAL.parse(out))
    const [main, sibling] = root.getAllSubcomponents('vtodo')
    expect(main?.getFirstPropertyValue('summary')).toBe('Edited')
    expect(sibling?.getFirstPropertyValue('summary')).toBe('Sibling todo')
    expect(sibling?.getFirstPropertyValue('x-sibling-prop')).toBe('untouched')
    expect(sibling?.getFirstProperty('last-modified')).toBeNull()
  })
})
```

- [ ] **Step 3: Run test to verify it fails or passes**

Run: `bun run test -- packages/vtodo`
Expected: PASS if Task 5's implementation is correct (this task adds the
guarantee tests; ical.js preserves unknown data by design). If any assertion
fails, the implementation — not the test — is wrong: investigate with the
systematic-debugging skill before changing any assertion.

- [ ] **Step 4: Typecheck the package**

Run: `bun run --filter @caldav-todo/vtodo typecheck`
Expected: exit 0.

- [ ] **Step 5: Lint, format, commit**

```bash
bun run lint && bun run fmt
git add -A && git commit -m "test(vtodo): round-trip preservation guarantees"
```
