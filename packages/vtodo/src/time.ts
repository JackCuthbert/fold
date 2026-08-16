import type { TodoDue } from '@fold/schemas'
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
export function setDueOnComponent(vtodo: ICAL.Component, due: TodoDue): void {
  vtodo.removeProperty('due')
  const property = new ICAL.Property('due', vtodo)

  if (due.kind === 'date') {
    // setValue with a date-typed Time already emits VALUE=DATE; setting the
    // parameter explicitly would duplicate it (DUE;VALUE=DATE;VALUE=DATE:…).
    property.setValue(ICAL.Time.fromDateString(due.value))
    vtodo.addProperty(property)
    return
  }

  const time = ICAL.Time.fromString(
    due.kind === 'utc' ? `${due.value.slice(0, 19)}Z` : due.value,
    undefined,
  )
  if (due.kind === 'zoned') property.setParameter('tzid', due.tzid)
  property.setValue(time)
  vtodo.addProperty(property)
}
