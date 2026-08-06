import type { Todo } from '@fold/schemas'

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const

// Resolve each DUE form to a comparison instant in the VIEWER's timezone —
// docs/specs/todos.md#ordering-and-overdue-comparison. Display only; this
// is never written back to the server.
const zonedOffsetMs = (local: string, tzid: string): number => {
  try {
    const asUtc = new Date(`${local}Z`)
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tzid,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    const parts = Object.fromEntries(
      formatter.formatToParts(asUtc).map((part) => [part.type, part.value]),
    )
    const shown = Date.parse(
      `${parts['year']}-${parts['month']}-${parts['day']}` +
        `T${parts['hour'] === '24' ? '00' : parts['hour']}:` +
        `${parts['minute']}:${parts['second']}Z`,
    )
    return asUtc.getTime() - shown
  } catch {
    // Unknown zone: treat as floating.
    return 0
  }
}

export const dueInstant = (todo: Todo): number => {
  const due = todo.due
  if (!due) return Number.POSITIVE_INFINITY
  switch (due.kind) {
    case 'date': {
      // An all-day todo isn't overdue until the local day is over.
      const [year, month, day] = due.value.split('-').map(Number)
      return new Date(
        year ?? 0,
        (month ?? 1) - 1,
        day ?? 1,
        23,
        59,
        59,
        999,
      ).getTime()
    }
    case 'utc':
      return new Date(due.value).getTime()
    case 'floating':
      // "9am wherever you are" — parse without a zone suffix so the
      // runtime applies local time.
      return new Date(due.value).getTime()
    case 'zoned':
      return (
        new Date(`${due.value}Z`).getTime() + zonedOffsetMs(due.value, due.tzid)
      )
    default:
      return due satisfies never
  }
}

export const isOverdue = (todo: Todo, now: Date): boolean =>
  dueInstant(todo) < now.getTime()

// Sort order per docs/specs/todos.md: overdue, due date, priority, then
// oldest-first by creation time.
//
// That last comparison is what keeps a newly-created todo from jumping. The
// server's own todo order is arbitrary (Radicale returns resources in
// filesystem order of their UUID-named files — the same problem
// docs/specs/lists.md describes for collections), so for the common case of
// a todo with neither a due date nor a priority, *every* comparison above
// ties and the incoming server order decided placement. An optimistic
// insert can't predict that order, so the new todo sat where it was
// appended and then moved once the server response landed. CREATED is
// client-stamped, written once, and identical before and after the
// round-trip, so ordering by it puts the new todo at the end — where it was
// added — and keeps it there. Todos with no CREATED (written by another
// client) sort before those that have one, keeping them in a stable block
// rather than interleaving unpredictably. *(fixed 2026-08-01.)*
export function sortActiveTodos(todos: readonly Todo[], now: Date): Todo[] {
  return todos.toSorted((a, b) => {
    const overdue = Number(isOverdue(b, now)) - Number(isOverdue(a, now))
    if (overdue !== 0) return overdue
    const dueA = dueInstant(a)
    const dueB = dueInstant(b)
    // Both without a due date resolve to +Infinity; the subtraction below
    // would be Infinity - Infinity = NaN, which sort() treats as "equal"
    // without ever falling through to the priority tie-break.
    if (dueA !== dueB) return dueA - dueB
    const priority =
      PRIORITY_RANK[a.priority ?? 'low'] - PRIORITY_RANK[b.priority ?? 'low']
    if (priority !== 0 && (a.priority || b.priority)) return priority
    // ISO-8601 UTC strings compare lexicographically. '' sorts before any
    // real timestamp, so CREATED-less todos form a stable leading block.
    return (a.created ?? '').localeCompare(b.created ?? '')
  })
}
