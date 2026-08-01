import type { NewTodo } from '@fold/schemas'
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
  // RFC 5545 §3.8.7.1. Unlike DTSTAMP (rewritten on every edit — see
  // update.ts), CREATED is written once and never changes, which is what
  // makes it usable as a stable ordering key: it gives todos that tie on
  // due date and priority a deterministic order that survives the
  // round-trip, so a newly-added todo doesn't move when the server
  // response lands (docs/specs/todos.md — ordering). The client's own
  // timestamp is preferred when present so the optimistic placeholder and
  // the stored copy sort identically; `now` is the fallback for a create
  // that didn't carry one.
  vtodo.updatePropertyWithValue(
    'created',
    input.created
      ? icalTimeFromDate(new Date(input.created))
      : icalTimeFromDate(now),
  )
  vtodo.updatePropertyWithValue('summary', input.summary)
  vtodo.updatePropertyWithValue('status', 'NEEDS-ACTION')
  if (input.due) {
    setDueOnComponent(vtodo, input.due)
  }
  if (input.description !== undefined) {
    vtodo.updatePropertyWithValue('description', input.description)
  }
  if (input.priority) {
    vtodo.updatePropertyWithValue('priority', priorityToNumber(input.priority))
  }
  root.addSubcomponent(vtodo)
  return root.toString()
}
