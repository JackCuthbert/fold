import type { TodoChanges } from '@caldav-todo/schemas'
import ICAL from 'ical.js'
import { VtodoError } from './error'
import { priorityToNumber } from './priority'
import { dueToIcalTime, icalTimeFromDate } from './time'

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
    else vtodo.updatePropertyWithValue('due', dueToIcalTime(changes.due))
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
