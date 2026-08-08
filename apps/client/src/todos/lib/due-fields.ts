import type { TodoDue } from '@fold/schemas'

// docs/specs/todos.md — due times. The add and edit forms both express a
// DUE as two inputs: a date (yyyy-mm-dd) and an optional time (HH:mm).
// Converting between that pair and the four-form `TodoDue` union is the
// same job in both places, so it lives here once rather than being
// reimplemented — the two had already drifted apart on the all-day case.

/** The two form inputs. Empty string means "not set" for both. */
export interface DueFields {
  date: string
  time: string
}

export const EMPTY_DUE_FIELDS: DueFields = { date: '', time: '' }

/**
 * The viewer's IANA zone, e.g. `Australia/Brisbane`.
 *
 * docs/specs/todos.md — due times: a todo due "9am" means 9am *where you
 * set it*, so we write `zoned` with this identifier rather than resolving
 * to a UTC instant whose wall-clock reading would drift as you travel or
 * as DST shifts.
 */
export const viewerTimeZone = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone

const pad = (value: number): string => String(value).padStart(2, '0')

/** Local yyyy-mm-dd — not `toISOString`, which shifts across the zone. */
const localDate = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

const localTime = (date: Date): string =>
  `${pad(date.getHours())}:${pad(date.getMinutes())}`

/**
 * Today as the `yyyy-mm-dd` an `<input type="date">` expects.
 *
 * Seeded into the date field when the "Due date" switch is turned on
 * (todos/due-controls) — turning the switch on means "this has a due
 * date", so it must produce one rather than an empty required field.
 * Shares `localDate` deliberately: the reason not to use `toISOString`
 * here is the same one, and it should not be restated somewhere it can
 * drift.
 */
export const todayDateValue = (): string => localDate(new Date())

/**
 * Split a stored `TodoDue` into the date and time inputs.
 *
 * All-day todos yield an empty time, which is what keeps the time field
 * blank rather than showing the 23:59 that the ordering rule
 * (docs/specs/todos.md — ordering) resolves an all-day date to.
 *
 * `floating` and `zoned` are read as *wall-clock* text, never through a
 * Date — parsing them would apply the host offset and silently reinterpret
 * one form as another, which the spec forbids.
 */
export function dueToFields(due: TodoDue | undefined): DueFields {
  if (!due) return EMPTY_DUE_FIELDS
  switch (due.kind) {
    case 'date':
      return { date: due.value, time: '' }
    case 'floating':
    case 'zoned':
      // 'yyyy-mm-ddTHH:mm:ss' — slice, don't parse.
      return { date: due.value.slice(0, 10), time: due.value.slice(11, 16) }
    case 'utc': {
      // A real instant: show it as the viewer's local wall clock.
      const instant = new Date(due.value)
      return { date: localDate(instant), time: localTime(instant) }
    }
    default:
      return due satisfies never
  }
}

/**
 * Build the `TodoDue` to write from the form inputs, or `null` for "no due
 * date". Returns `undefined` when the input is unusable (a time with no
 * date), which the caller surfaces as a validation error rather than
 * silently dropping the time.
 */
export function fieldsToDue(
  fields: DueFields,
  timeZone: string = viewerTimeZone(),
): TodoDue | null | undefined {
  const date = fields.date.trim()
  const time = fields.time.trim()
  if (date === '') {
    // docs/specs/todos.md — due times: a time needs a date; DUE cannot
    // express one without the other.
    return time === '' ? null : undefined
  }
  if (time === '') return { kind: 'date', value: date }
  return {
    kind: 'zoned',
    tzid: timeZone,
    // Seconds are always zero: the picker offers minutes.
    value: `${date}T${time}:00`,
  }
}

// Note there is deliberately no `sameDue` helper. Deciding whether the user
// changed the due date is done by comparing the *form fields* (see
// todo-detail.tsx), not two `TodoDue` values: the date and time inputs
// cannot distinguish floating from zoned, so a rebuilt-from-fields due
// always looks different to a stored floating one even when nothing was
// touched — which would rewrite a foreign client's DUE on an unrelated
// edit (docs/specs/caldav-compliance.md).
