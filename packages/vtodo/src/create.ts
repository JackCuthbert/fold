import type { NewTodo } from '@fold/schemas'
import ICAL from 'ical.js'
import pkg from '../package.json' with { type: 'json' }
import { priorityToNumber } from './priority'
import { icalTimeFromDate, setDueOnComponent } from './time'

/**
 * Who wrote this file — RFC 5545 §3.7.3, required on every VCALENDAR.
 *
 * A provenance label, not an identifier: nothing keys off it, here or on
 * the server. It exists so a human debugging a todo in another client can
 * see which software produced it, which is why it carries the version —
 * "Fold wrote this" is less useful than "Fold 0.3.1 wrote this" when the
 * question is whether some past release mangled a property.
 *
 * The `-//…//EN` shape is the convention (Apple writes `-//Apple
 * Inc.//macOS 14.0//EN`): a leading `-` for a product with no registered
 * ISO name, and the language of the text it contains.
 *
 * The version comes from **this package's own** `package.json`, not the
 * workspace root: `packages/` are meant to be publishable on their own
 * (CLAUDE.md), and a published `@fold/vtodo` would have no root manifest
 * to reach up to. That means this package must be listed in
 * release-please's `extra-files`, or it stays pinned at 0.1.0 and emits a
 * stale version forever — it was added there in the same change.
 *
 * *(changed 2026-08-11: was `-//caldav-todo-client//EN`, the name the
 * project had before it was renamed to Fold. Todos created before this
 * keep the old value — `update.ts` never rewrites PRODID, per
 * docs/architecture/round-trip-preservation.md — so a server will hold a
 * mix of both. Nothing reads it, so the mix is cosmetic.)*
 */
const PRODID = `-//JackCuthbert//Fold ${pkg.version}//EN`

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
