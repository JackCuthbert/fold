import type { TodoDue, TodoPriority } from '@caldav-todo/schemas'
import ICAL from 'ical.js'
import { priorityFromNumber } from './priority'
import { dueFromProperty } from './time'

export interface VtodoData {
  uid: string
  summary: string
  completed: boolean
  due?: TodoDue
  description?: string
  priority?: TodoPriority
}

export function readTodo(ics: string): VtodoData | null {
  let root: ICAL.Component
  try {
    root = new ICAL.Component(ICAL.parse(ics))
  } catch {
    return null
  }
  const vtodo = root.getFirstSubcomponent('vtodo')
  if (!vtodo) return null

  const uid = vtodo.getFirstPropertyValue('uid')
  if (typeof uid !== 'string' || uid === '') return null

  const summary = vtodo.getFirstPropertyValue('summary')
  const description = vtodo.getFirstPropertyValue('description')
  const dueProperty = vtodo.getFirstProperty('due')
  const due = dueProperty
    ? (dueFromProperty(dueProperty) ?? undefined)
    : undefined
  const priority = priorityFromNumber(vtodo.getFirstPropertyValue('priority'))

  return {
    uid,
    summary: typeof summary === 'string' ? summary : '',
    completed: vtodo.getFirstPropertyValue('status') === 'COMPLETED',
    ...(due ? { due } : {}),
    ...(typeof description === 'string' && description !== ''
      ? { description }
      : {}),
    ...(priority ? { priority } : {}),
  }
}
