import type { TodoDue } from '@fold/schemas'
import { dueToFields, fieldsToDue } from './due-fields'

// docs/specs/todos.md — quick scheduling. The context menu can move a todo
// to today or tomorrow without opening the detail panel, which is the
// single most common edit and the one that cost the most taps.
//
// This is a *date* change, never a time change. A todo due tomorrow at 9am
// that you pull forward to today is still due at 9am — dropping the time
// would silently discard information the row is displaying, and re-adding
// it means opening the panel, which is the thing this exists to avoid. The
// time therefore rides along untouched, and an all-day todo stays all-day.

/**
 * Days from today. 0 is today, 1 tomorrow, and the weekend actions supply
 * whatever `daysUntilWeekday` works out.
 *
 * Widened from `0 | 1` when "This Saturday"/"This Sunday" were added: the
 * offset is now computed rather than chosen from a fixed pair.
 * *(changed 2026-08-17.)*
 */
export type ScheduleOffset = number

/** Sunday is 0 in `Date#getDay`, matching the platform rather than ISO. */
export const SATURDAY = 6
export const SUNDAY = 0

/**
 * Days from `now` until the next `weekday`, where **today counts as zero**.
 *
 * "This Saturday" on a Saturday means today, not the Saturday a week out.
 * Scheduling a week ahead from a menu item naming the day you are looking
 * at reads as a bug; if the todo is already due today the item disables
 * itself through `scheduleIsNoop`, which is the same answer Today gives.
 * *(added 2026-08-17.)*
 */
export function daysUntilWeekday(now: Date, weekday: number): number {
  return (weekday - now.getDay() + 7) % 7
}

/**
 * The `yyyy-mm-dd` that is `offset` days from `now`, in local time.
 *
 * Built by mutating a local `Date` rather than by adding 86_400_000 ms:
 * across a DST boundary a day is 23 or 25 hours, so arithmetic on the
 * instant lands on the wrong calendar day exactly twice a year.
 * `setDate` rolls the month and year over for us.
 */
export function scheduleDate(now: Date, offset: ScheduleOffset): string {
  const target = new Date(now)
  target.setDate(target.getDate() + offset)
  const month = String(target.getMonth() + 1).padStart(2, '0')
  const day = String(target.getDate()).padStart(2, '0')
  return `${target.getFullYear()}-${month}-${day}`
}

/**
 * The `due` to write when scheduling an existing todo for today/tomorrow.
 *
 * **Without a `time`, keeps whatever time the todo already carried**, so
 * the plain Today/Tomorrow actions only ever move the date — a todo due
 * tomorrow at 9am pulled forward to today is still due at 9am.
 *
 * **With a `time` (`HH:mm`), sets it**, which is what the "Tomorrow 9am"
 * and "Today 5pm" actions do. Passing a time is the caller saying the
 * whole point is the time, so overwriting is the intent rather than a loss
 * (docs/specs/todos.md — row actions). *(added 2026-08-11.)*
 *
 * Returns a `TodoDue`, never `undefined`: the date is supplied here rather
 * than typed by a user, so the "time without a date" case `fieldsToDue`
 * guards against cannot arise.
 */
export function scheduledDue(
  due: TodoDue | undefined,
  now: Date,
  offset: ScheduleOffset,
  time?: string,
): TodoDue {
  const fields = dueToFields(due)
  const next = fieldsToDue({
    date: scheduleDate(now, offset),
    time: time ?? fields.time,
  })
  // `fieldsToDue` returns null only for an empty date and undefined only
  // for a time without one; `scheduleDate` always yields a date, so
  // neither is reachable. The fallback keeps the return type honest
  // without a non-null assertion.
  return next ?? { kind: 'date', value: scheduleDate(now, offset) }
}

/**
 * A `HH:mm` time as the viewer's locale writes it — "9:00 am", "17:00".
 *
 * The menu's timed actions are labelled with this rather than a literal
 * "9am", which would be wrong in every 24-hour locale. Formatted through
 * the same `toLocaleTimeString` options the row's due pill uses
 * (todos/todo-meta), so the label and the pill it produces agree.
 *
 * The date is arbitrary and never shown — only the clock reading matters.
 * *(added 2026-08-11.)*
 */
export function formatScheduleTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  const at = new Date()
  at.setHours(hours ?? 0, minutes ?? 0, 0, 0)
  return at.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * Has `time` (`HH:mm`) already passed today?
 *
 * The menu offers "Today 5:00 pm", which after 5pm would set a due time in
 * the past — an instantly-overdue todo, which is worse than not offering
 * the shortcut at all. The item is disabled once this returns true.
 *
 * Compares wall-clock minutes rather than building a Date: the question is
 * about the viewer's own clock reading, and minutes-since-midnight answers
 * it without a timezone in the way. *(added 2026-08-11.)*
 */
export function timeHasPassed(time: string, now: Date): boolean {
  const [hours, minutes] = time.split(':').map(Number)
  const target = (hours ?? 0) * 60 + (minutes ?? 0)
  return now.getHours() * 60 + now.getMinutes() >= target
}

/**
 * Would scheduling this todo change anything?
 *
 * "Today" on a todo already due today writes back the value it already
 * had — a no-op that still costs a CalDAV round-trip, and reads as a
 * button that does nothing. The item is disabled instead, which says
 * *why* nothing would happen rather than leaving you to click and wonder.
 *
 * Compares the `TodoDue` we would write against the one stored, so it is
 * exactly "the write is pointless" rather than a guess from the date
 * alone: "Today 5:00 pm" on a todo due today at 9am is still a real
 * change. *(added 2026-08-11.)*
 */
export function scheduleIsNoop(
  due: TodoDue | undefined,
  now: Date,
  offset: ScheduleOffset,
  time?: string,
): boolean {
  if (!due) return false
  const next = scheduledDue(due, now, offset, time)
  if (next.value !== due.value) return false
  // A zoned due also carries its zone; two values agreeing on wall-clock
  // text but not on zone are different instants. Both sides are narrowed
  // by their own `kind` check rather than one being asserted from the
  // other's — the union is the type's whole point.
  if (next.kind === 'zoned') {
    return due.kind === 'zoned' && next.tzid === due.tzid
  }
  return next.kind === due.kind
}
