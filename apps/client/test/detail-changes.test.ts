import type { Todo } from '@fold/schemas'
import { describe, expect, it } from 'vitest'
import { dueToFields } from '../src/todos/due-fields'
import {
  detailChanges,
  type DetailForm,
} from '../src/todos/use-todo-detail-form'

// The edit form's submit step — docs/specs/todos.md, and
// docs/specs/caldav-compliance.md for the DUE rule, which is the reason
// this is a pure function rather than inline in the component: getting it
// wrong rewrites a foreign client's DUE on an unrelated edit, silently.

const ZONE = 'Australia/Brisbane'

const todoWith = (over: Partial<Todo>): Todo => ({
  uid: 'u1',
  listId: 'list-a',
  href: '/list-a/u1.ics',
  etag: '"1"',
  summary: 'Stored summary',
  completed: false,
  ...over,
})

const formFor = (todo: Todo, over: Partial<DetailForm> = {}): DetailForm => {
  const fields = dueToFields(todo.due)
  return {
    summary: todo.summary,
    due: fields.date,
    dueTime: fields.time,
    description: todo.description ?? '',
    priority: todo.priority ?? '',
    listId: todo.listId,
    ...over,
  }
}

describe('detailChanges', () => {
  it('sends no due change when neither date nor time was touched', () => {
    // The case that matters: a *floating* DUE, which the two inputs render
    // identically to a zoned one. Rebuilding it would produce a zoned value
    // and look like an edit, rewriting what another client wrote.
    const todo = todoWith({
      due: { kind: 'floating', value: '2026-08-15T14:30:00' },
    })
    const initial = dueToFields(todo.due)
    const changes = detailChanges(
      formFor(todo, { summary: 'Renamed' }),
      todo,
      initial,
      ZONE,
    )

    expect(changes).not.toHaveProperty('due')
    expect(changes.summary).toBe('Renamed')
  })

  it('leaves a UTC due untouched when only the notes change', () => {
    const todo = todoWith({
      due: { kind: 'utc', value: '2026-08-15T04:30:00' },
    })
    const initial = dueToFields(todo.due)
    const changes = detailChanges(
      formFor(todo, { description: 'a note' }),
      todo,
      initial,
      ZONE,
    )

    expect(changes).not.toHaveProperty('due')
    expect(changes.description).toBe('a note')
  })

  it('writes a zoned due once the time is actually edited', () => {
    const todo = todoWith({
      due: { kind: 'floating', value: '2026-08-15T14:30:00' },
    })
    const initial = dueToFields(todo.due)
    const changes = detailChanges(
      formFor(todo, { dueTime: '09:00' }),
      todo,
      initial,
      ZONE,
    )

    expect(changes.due).toEqual({
      kind: 'zoned',
      tzid: ZONE,
      value: '2026-08-15T09:00:00',
    })
  })

  it('writes an all-day date when the time is cleared', () => {
    const todo = todoWith({
      due: { kind: 'zoned', tzid: ZONE, value: '2026-08-15T14:30:00' },
    })
    const initial = dueToFields(todo.due)
    const changes = detailChanges(
      formFor(todo, { dueTime: '' }),
      todo,
      initial,
      ZONE,
    )

    expect(changes.due).toEqual({ kind: 'date', value: '2026-08-15' })
  })

  it('clears the due date when both fields are emptied', () => {
    const todo = todoWith({ due: { kind: 'date', value: '2026-08-15' } })
    const initial = dueToFields(todo.due)
    const changes = detailChanges(
      formFor(todo, { due: '', dueTime: '' }),
      todo,
      initial,
      ZONE,
    )

    expect(changes.due).toBeNull()
  })

  it('omits the summary when it was not edited, so no needless rewrite', () => {
    const todo = todoWith({})
    const changes = detailChanges(
      formFor(todo),
      todo,
      dueToFields(todo.due),
      ZONE,
    )

    expect(changes).not.toHaveProperty('summary')
  })

  it('clears notes and priority when their fields are emptied', () => {
    // Explicit null is how an optional property is cleared, as opposed to
    // omission, which leaves it alone (packages/schemas — todoChangesSchema).
    const todo = todoWith({ description: 'old', priority: 'high' })
    const changes = detailChanges(
      formFor(todo, { description: '', priority: '' }),
      todo,
      dueToFields(todo.due),
      ZONE,
    )

    expect(changes.description).toBeNull()
    expect(changes.priority).toBeNull()
  })

  it('compares against the fields it was opened with, not the todo', () => {
    // `initialFields` is captured when the panel opens and must stay that
    // way: the form now outlives both surfaces (use-todo-detail-form.ts),
    // so a submit can happen long after the open. Passing fields that
    // disagree with `todo.due` proves the comparison uses the former —
    // here the values *match the form*, so there is no due change even
    // though the todo says otherwise.
    const todo = todoWith({ due: { kind: 'date', value: '2026-01-01' } })
    const openedWith = { date: '2026-08-15', time: '' }
    const changes = detailChanges(
      formFor(todo, { due: '2026-08-15', dueTime: '' }),
      todo,
      openedWith,
      ZONE,
    )

    expect(changes).not.toHaveProperty('due')
  })
})
