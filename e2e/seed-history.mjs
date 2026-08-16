/**
 * Seed completed todos with *old* `COMPLETED` timestamps, for trying out
 * "Clear completed" (docs/specs/todos.md — clearing completed todos).
 *
 *   bun run seed:history        (from the repo root)
 *
 * The dialog offers two actions, and which ones appear depends entirely on
 * how old the completed work is: the safe path only exists when something
 * has aged past the 30-day retention window
 * (docs/specs/summary-view.md — the retention window). Real usage takes a
 * month to produce that, so there is nothing to test against on a fresh
 * machine — hence this.
 *
 * **It writes `.ics` files straight into the local Radicale volume** rather
 * than going through the API. The API has no way to say "this was completed
 * six weeks ago", and it should not: back-dating history is exactly the
 * thing a todo client must never do to real data. Writing the files is
 * honest about being a test fixture.
 *
 * Local only, and destructive-ish: it adds resources to whatever lists it
 * finds under `radicale-data/`. Nothing here runs in CI.
 */
import { randomUUID } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(
  dirname(fileURLToPath(import.meta.url)),
  '../radicale-data/collections/collection-root/testuser',
)

if (!existsSync(root)) {
  console.error(
    `No local Radicale data at ${root}.\n` +
      'Start it with `docker compose up -d` and sign in once so the ' +
      'collections exist.',
  )
  process.exit(1)
}

/** iCalendar UTC stamp: 20260809T101500Z. */
const stamp = (date) =>
  `${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`

const daysAgo = (days) => {
  const when = new Date()
  when.setDate(when.getDate() - days)
  return when
}

/**
 * What to seed. Deliberately spread either side of the 30-day cutoff so
 * both of the dialog's actions have something to act on, and one carries
 * no `COMPLETED` at all — the case that is never cleared by either
 * (issue #39).
 */
const FIXTURES = [
  { summary: 'Renew the car registration', completedDaysAgo: 94 },
  { summary: 'File the Q1 receipts', completedDaysAgo: 78 },
  { summary: 'Book the dentist', completedDaysAgo: 61 },
  { summary: 'Replace the smoke alarm batteries', completedDaysAgo: 45 },
  { summary: 'Return the library books', completedDaysAgo: 38 },
  { summary: 'Send the insurance form', completedDaysAgo: 31 },
  // Inside the window — Summary still shows these, so only the heavier
  // action touches them.
  { summary: 'Pay the water bill', completedDaysAgo: 12 },
  { summary: 'Water the herbs', completedDaysAgo: 3 },
  // No COMPLETED property: neither action may clear it.
  { summary: 'Completed elsewhere, no timestamp', completedDaysAgo: null },
]

const listName = (dir) => {
  try {
    const props = JSON.parse(
      readFileSync(join(root, dir, '.Radicale.props'), 'utf8'),
    )
    return props['D:displayname'] ?? dir
  } catch {
    return null
  }
}

const collections = readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => ({ dir: entry.name, name: listName(entry.name) }))
  .filter((entry) => entry.name !== null)

if (collections.length === 0) {
  console.error('No lists found. Sign in once so Radicale creates some.')
  process.exit(1)
}

// Round-robin across the lists, so Summary has several to group by.
let written = 0
for (const [index, fixture] of FIXTURES.entries()) {
  const target = collections[index % collections.length]
  const uid = randomUUID()
  const created = stamp(daysAgo((fixture.completedDaysAgo ?? 5) + 7))
  const completedLine =
    fixture.completedDaysAgo === null
      ? ''
      : `COMPLETED:${stamp(daysAgo(fixture.completedDaysAgo))}\n`

  const ics =
    'BEGIN:VCALENDAR\n' +
    'VERSION:2.0\n' +
    'PRODID:-//caldav-todo-client//seed-history//EN\n' +
    'BEGIN:VTODO\n' +
    `CREATED:${created}\n` +
    `DTSTAMP:${created}\n` +
    completedLine +
    'LAST-MODIFIED:' +
    created +
    '\n' +
    'PERCENT-COMPLETE:100\n' +
    'SEQUENCE:1\n' +
    'STATUS:COMPLETED\n' +
    `SUMMARY:${fixture.summary}\n` +
    `UID:${uid}\n` +
    'END:VTODO\n' +
    'END:VCALENDAR\n'

  writeFileSync(join(root, target.dir, `${uid}.ics`), ics)
  const age =
    fixture.completedDaysAgo === null
      ? 'no timestamp'
      : `${fixture.completedDaysAgo}d ago`
  console.log(`  ${target.name.padEnd(12)} ${fixture.summary}  (${age})`)
  written += 1
}

console.log(
  `\nSeeded ${written} completed todos.\n` +
    'Radicale re-reads the directory, so reload the app — no restart needed.',
)
