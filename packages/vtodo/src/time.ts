import type { TodoDue } from '@caldav-todo/schemas'
import ICAL from 'ical.js'

export function icalTimeFromDate(date: Date): ICAL.Time {
  return ICAL.Time.fromJSDate(date, true)
}

export function dueToIcalTime(due: TodoDue): ICAL.Time {
  if (due.kind === 'date') return ICAL.Time.fromDateString(due.value)
  return ICAL.Time.fromJSDate(new Date(due.value), true)
}

export function icalTimeToDue(time: ICAL.Time): TodoDue {
  if (time.isDate) return { kind: 'date', value: time.toString() }
  return { kind: 'date-time', value: time.toJSDate().toISOString() }
}
