/**
 * Wipe the local Radicale volume and seed a complete, coherent data set —
 * enough that every feature in the app has something to show.
 *
 *   bun run seed:all        (from the repo root)
 *
 * `seed-history.mjs` only back-dates completed work into whatever lists it
 * finds, which assumes a signed-in account that already has some. This is
 * the "start from nothing and get a full app" script: it deletes every
 * collection under the test user and rebuilds them.
 *
 * **Destructive, and local only.** It removes `radicale-data/collections/
 * collection-root/testuser/` outright. That is safe here because the
 * volume is throwaway test data, and nothing in CI runs this.
 *
 * Like `seed-history.mjs` it writes `.ics` files and `.Radicale.props`
 * directly rather than going through the API — the API cannot say "this
 * was completed six weeks ago", and it should not
 * (docs/specs/todos.md — clearing completed todos).
 *
 * The data is chosen to exercise, in one pass:
 *
 * - every list kind (docs/specs/list-kinds.md) — grocery, chores, media,
 *   health — plus plain lists, so grouping, bulk actions, the no-due-date
 *   rule and the health block all have a subject
 * - list colours and explicit ordering (docs/specs/lists.md)
 * - all four due-date forms, overdue and upcoming (docs/specs/todos.md)
 * - all three priorities, descriptions, and a todo with neither
 * - completed work either side of the 30-day retention window, plus one
 *   with no COMPLETED stamp (docs/specs/summary-view.md, issue #39)
 * - Today, Tomorrow, Summary and Search all non-empty
 */
import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(
  dirname(fileURLToPath(import.meta.url)),
  '../radicale-data/collections/collection-root/testuser',
)

/** iCalendar UTC stamp: 20260810T101500Z. */
const stamp = (date) =>
  `${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`

/** iCalendar all-day value: 20260810. */
const dayStamp = (date) =>
  `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(
    date.getDate(),
  ).padStart(2, '0')}`

const shift = (days, hours = 0) => {
  const when = new Date()
  when.setDate(when.getDate() + days)
  if (hours) when.setHours(hours, 0, 0, 0)
  return when
}

/**
 * The lists. Names are load-bearing: a kind is derived from the display
 * name and nothing else (docs/specs/list-kinds.md — entirely app-level),
 * so "Groceries" groups and "Shopping trip" would not.
 */
const LISTS = [
  { name: 'Bueno', color: '#4F9D69FF', order: 1 },
  { name: 'Groceries', color: '#5D7F52FF', order: 2 },
  { name: 'Chores', color: '#8A7A4EFF', order: 3 },
  { name: 'Reading', color: '#4A6F96FF', order: 4 },
  { name: 'Health', color: '#8C5568FF', order: 5 },
  { name: 'Therapy', color: '#5A7052FF', order: 6 },
  // Deliberately uncoloured, so the empty-ring dot has a subject.
  { name: 'Someday', color: null, order: 7 },
]

/**
 * The todos, by list.
 *
 * `due` takes the four forms the codec supports: a bare date (all-day), a
 * UTC instant, a floating local time, and a zoned time. All four are
 * seeded because they sort and display differently
 * (docs/specs/todos.md — due dates and timezones).
 */
const TODOS = {
  Bueno: [
    {
      summary: 'BEG multiplatform stakeholder meeting',
      priority: 'high',
      due: { kind: 'utc', at: shift(0, 11) },
    },
    {
      summary: 'Review where I am up to with Agenda scheduler',
      priority: 'high',
      due: { kind: 'utc', at: shift(0, 15) },
    },
    {
      summary: 'Summarise meeting notes',
      description:
        'Following the multiplatform stakeholder meeting - summarise notes taken',
      priority: 'medium',
      due: { kind: 'floating', at: shift(1, 12) },
    },
    {
      summary: 'Message Amelia re: IdP meeting',
      description: 'Meeting booked Tue 4.30pm',
      priority: 'low',
      due: { kind: 'utc', at: shift(1, 16) },
    },
    // Overdue, so the clock pill and the danger ink have a subject.
    {
      summary: 'Respond to Pat about the Odyssey pull request',
      description: 'https://github.com/copelandsoftware/bueno_odyssey/pull/9',
      due: { kind: 'utc', at: shift(-2, 10) },
    },
    // Neither due nor priority: the row with no meta line at all.
    { summary: 'Draft the quarterly plan' },
  ],
  Groceries: [
    { summary: 'Milk' },
    { summary: 'Eggs' },
    { summary: 'Bread', due: { kind: 'date', at: shift(0) } },
    { summary: 'Coffee beans' },
    { summary: 'Olive oil' },
  ],
  Chores: [
    {
      summary: 'Fix the blinds in the living room',
      due: { kind: 'date', at: shift(-3) },
    },
    { summary: 'Take the bins out', due: { kind: 'date', at: shift(1) } },
    { summary: 'Clean the oven', priority: 'low' },
  ],
  Reading: [
    { summary: 'The Book lucy recommended' },
    { summary: 'Finish the Pragmatic Programmer' },
    { summary: 'Start the new Le Guin' },
  ],
  Health: [
    // Health leads Today in a block of its own, so this needs to be due.
    {
      summary: 'Take the evening medication',
      due: { kind: 'date', at: shift(0) },
      priority: 'high',
    },
    { summary: 'Book the annual check-up' },
    { summary: 'Refill the prescription', due: { kind: 'date', at: shift(2) } },
  ],
  Therapy: [
    {
      summary: 'Go to appointment',
      due: { kind: 'zoned', at: shift(0, 9), tzid: 'Australia/Sydney' },
    },
    { summary: 'Write up the week before Thursday' },
  ],
  Someday: [
    { summary: 'Learn to develop film at home' },
    { summary: 'Plan the Japan trip' },
  ],
}

/**
 * Completed work, spread either side of the 30-day retention window so
 * both of Clear completed's actions have something to act on, and one with
 * no COMPLETED stamp at all — the case neither action may clear
 * (docs/specs/summary-view.md, issue #39).
 */
const DONE = [
  { list: 'Reading', summary: 'Renew the car registration', daysAgo: 94 },
  { list: 'Groceries', summary: 'File the Q1 receipts', daysAgo: 78 },
  { list: 'Therapy', summary: 'Book the dentist', daysAgo: 61 },
  { list: 'Health', summary: 'Replace the smoke alarm batteries', daysAgo: 45 },
  { list: 'Chores', summary: 'Return the library books', daysAgo: 38 },
  { list: 'Bueno', summary: 'Send the insurance form', daysAgo: 31 },
  // Inside the window — Summary shows these, so they carry the day headings.
  { list: 'Chores', summary: 'Pay the water bill', daysAgo: 12 },
  { list: 'Reading', summary: 'Water the herbs', daysAgo: 3 },
  { list: 'Bueno', summary: 'Ship the release notes', daysAgo: 1 },
  { list: 'Health', summary: 'Morning walk', daysAgo: 0 },
  // A whole grocery run, done today: the collapsed row needs several.
  { list: 'Groceries', summary: 'Tomatoes', daysAgo: 0 },
  { list: 'Groceries', summary: 'Butter', daysAgo: 0 },
  // No COMPLETED property: excluded from Summary, never cleared, and
  // marked on the row instead (issue #39).
  { list: 'Groceries', summary: 'Completed elsewhere', daysAgo: null },
]

const dueLines = (due) => {
  if (!due) return ''
  if (due.kind === 'date') return `DUE;VALUE=DATE:${dayStamp(due.at)}\n`
  if (due.kind === 'floating')
    return `DUE:${dayStamp(due.at)}T${String(due.at.getHours()).padStart(2, '0')}0000\n`
  if (due.kind === 'zoned')
    return `DUE;TZID=${due.tzid}:${dayStamp(due.at)}T${String(
      due.at.getHours(),
    ).padStart(2, '0')}0000\n`
  return `DUE:${stamp(due.at)}\n`
}

const PRIORITY_VALUE = { high: 1, medium: 5, low: 9 }

const vtodo = (todo, { completedAt, undated } = {}) => {
  const uid = randomUUID()
  const created = stamp(shift(-14))
  const done = completedAt !== undefined
  const lines =
    'BEGIN:VCALENDAR\n' +
    'VERSION:2.0\n' +
    'PRODID:-//caldav-todo-client//seed-all//EN\n' +
    'BEGIN:VTODO\n' +
    `CREATED:${created}\n` +
    `DTSTAMP:${created}\n` +
    `LAST-MODIFIED:${created}\n` +
    (done && !undated ? `COMPLETED:${stamp(completedAt)}\n` : '') +
    (done ? 'PERCENT-COMPLETE:100\nSTATUS:COMPLETED\n' : '') +
    (todo.priority ? `PRIORITY:${PRIORITY_VALUE[todo.priority]}\n` : '') +
    (todo.description ? `DESCRIPTION:${todo.description}\n` : '') +
    dueLines(todo.due) +
    'SEQUENCE:1\n' +
    `SUMMARY:${todo.summary}\n` +
    `UID:${uid}\n` +
    'END:VTODO\n' +
    'END:VCALENDAR\n'
  return { uid, ics: lines }
}

// --- wipe -----------------------------------------------------------------

rmSync(root, { recursive: true, force: true })
mkdirSync(root, { recursive: true })
// Radicale needs the user collection itself to be a collection.
writeFileSync(join(root, '.Radicale.props'), '{"tag": "VADDRESSBOOK"}\n')
rmSync(join(root, '.Radicale.props'))

console.log('Wiped radicale-data/…/testuser\n')

// --- lists ----------------------------------------------------------------

const dirFor = {}
for (const list of LISTS) {
  const dir = randomUUID()
  dirFor[list.name] = dir
  mkdirSync(join(root, dir), { recursive: true })
  const props = {
    'D:displayname': list.name,
    ...(list.color ? { 'ICAL:calendar-color': list.color } : {}),
    'ICAL:calendar-order': String(list.order),
    tag: 'VCALENDAR',
  }
  writeFileSync(join(root, dir, '.Radicale.props'), JSON.stringify(props))
  console.log(`  list  ${list.name}`)
}

// --- active todos ---------------------------------------------------------

let active = 0
for (const [listName, todos] of Object.entries(TODOS)) {
  for (const todo of todos) {
    const { uid, ics } = vtodo(todo)
    writeFileSync(join(root, dirFor[listName], `${uid}.ics`), ics)
    active += 1
  }
}

// --- completed todos ------------------------------------------------------

let done = 0
for (const entry of DONE) {
  const { uid, ics } = vtodo(
    { summary: entry.summary },
    entry.daysAgo === null
      ? { completedAt: null, undated: true }
      : { completedAt: shift(-entry.daysAgo, 14) },
  )
  writeFileSync(join(root, dirFor[entry.list], `${uid}.ics`), ics)
  done += 1
}

console.log(
  `\nSeeded ${LISTS.length} lists, ${active} active and ${done} completed todos.\n` +
    'Radicale re-reads the directory, so just reload the app.',
)
