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
    vtodo.updatePropertyWithValue('priority', priorityToNumber(input.priority))
  }
  root.addSubcomponent(vtodo)
  return root.toString()
}
