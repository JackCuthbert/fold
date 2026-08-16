import type { TodoDue, TodoPriority } from '@fold/schemas'
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
  /**
   * RFC 5545 §3.8.7.1 CREATED, as an ISO-8601 UTC string. Optional: it is
   * not a required VTODO property, so todos written by other clients may
   * not carry one. Used only as a stable ordering tie-break
   * (docs/specs/todos.md — ordering); never written back except on create.
   */
  created?: string
  /**
   * RFC 5545 §3.8.2.1 COMPLETED — when the todo was finished, as an
   * ISO-8601 UTC string. The spec defines it as a UTC DATE-TIME, so unlike
   * DUE there are no timezone forms to preserve: it is always a real
   * instant.
   *
   * Optional, and absent on anything still open. It may also be missing
   * from a completed todo written by another client, since RFC 5545 does
   * not require it alongside STATUS:COMPLETED — so `completed === true`
   * with no `completedAt` is valid and must not be treated as an error.
   *
   * Read-only here: `applyChanges` stamps it when a todo is marked done
   * (update.ts) and clears it when reopened. It is what makes the Summary
   * view possible (docs/specs/summary-view.md).
   */
  completedAt?: string
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
  // ICAL.Time (or absent). Normalised to an ISO-8601 UTC string so the
  // value compares lexicographically and survives JSON transport.
  const createdValue = vtodo.getFirstPropertyValue('created')
  const created =
    createdValue instanceof ICAL.Time
      ? createdValue.toJSDate().toISOString()
      : undefined
  // RFC 5545 §3.8.2.1 COMPLETED — always a UTC DATE-TIME, so unlike DUE
  // there is no timezone form to preserve.
  const completedAtValue = vtodo.getFirstPropertyValue('completed')
  const completedAt =
    completedAtValue instanceof ICAL.Time
      ? completedAtValue.toJSDate().toISOString()
      : undefined

  return {
    uid,
    summary: typeof summary === 'string' ? summary : '',
    completed: vtodo.getFirstPropertyValue('status') === 'COMPLETED',
    ...(due ? { due } : {}),
    ...(typeof description === 'string' && description !== ''
      ? { description }
      : {}),
    ...(priority ? { priority } : {}),
    ...(created ? { created } : {}),
    ...(completedAt ? { completedAt } : {}),
  }
}
