import type { Todo } from '@fold/schemas'
import { describe, expect, it } from 'vitest'
import { duplicateTodo } from '../src/todos/duplicate-todo'

const base: Todo = {
  uid: 'source-uid',
  listId: 'list-1',
  href: '/l/source.ics',
  etag: '"abc"',
  summary: 'Write the report',
  completed: false,
}

describe('duplicateTodo', () => {
  it('marks the copy without burying the words you read first', () => {
    expect(duplicateTodo(base, 'new-uid').summary).toBe(
      'Write the report (copy)',
    )
  })

  it('takes the new uid, never the source one', () => {
    expect(duplicateTodo(base, 'new-uid').uid).toBe('new-uid')
  })

  it('carries the fields worth copying', () => {
    const copy = duplicateTodo(
      {
        ...base,
        due: { kind: 'date', value: '2026-08-10' },
        description: 'Some notes',
        priority: 'high',
      },
      'new-uid',
    )
    expect(copy.due).toEqual({ kind: 'date', value: '2026-08-10' })
    expect(copy.description).toBe('Some notes')
    expect(copy.priority).toBe('high')
  })

  // The point of the feature: duplicating a finished todo gives you live
  // work, not a second record of the same finished thing.
  it('never copies completion, even from a completed todo', () => {
    const copy = duplicateTodo(
      { ...base, completed: true, completedAt: '2026-08-01T09:00:00Z' },
      'new-uid',
    )
    // `NewTodo` has no completion fields at all — this is structural, and
    // this test is what stops a future field being added blindly.
    expect(copy).not.toHaveProperty('completed')
    expect(copy).not.toHaveProperty('completedAt')
  })

  // `created` belongs to the copy, not the original: it is new work, and
  // ordering depends on it. `useTodoActions.add` stamps it.
  it('does not carry the source timestamps', () => {
    const copy = duplicateTodo(
      { ...base, created: '2026-01-01T00:00:00Z' },
      'new-uid',
    )
    expect(copy).not.toHaveProperty('created')
  })

  // exactOptionalPropertyTypes: an absent optional must be absent, not
  // present-and-undefined, or the schema and the wire format disagree.
  it('omits absent optionals rather than setting them undefined', () => {
    const copy = duplicateTodo(base, 'new-uid')
    expect(Object.keys(copy).toSorted()).toEqual(['summary', 'uid'])
  })

  it('leaves the source untouched', () => {
    const source: Todo = { ...base }
    duplicateTodo(source, 'new-uid')
    expect(source).toEqual(base)
  })
})
