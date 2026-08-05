import type { Todo, TodoList } from '@fold/schemas'
import { describe, expect, it } from 'vitest'
import {
  groupTodos,
  leadsDerivedViews,
  partitionFirst,
} from '../src/todos/group-by-list'

const list = (id: string, displayName: string): TodoList => ({
  id,
  href: `/${id}`,
  displayName,
  ctag: 'c',
})

const todo = (uid: string, listId: string): Todo => ({
  uid,
  listId,
  href: `/${uid}`,
  etag: 'e',
  summary: uid,
  completed: false,
})

const LISTS = [list('g', 'Groceries'), list('w', 'Work')]

// docs/specs/list-kinds.md — grouping in derived views.
describe('groupTodos', () => {
  it('collapses a grouping list into one row, leaving others alone', () => {
    const rows = groupTodos(
      [todo('eggs', 'g'), todo('report', 'w'), todo('milk', 'g')],
      LISTS,
    )
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      kind: 'group',
      listName: 'Groceries',
    })
    expect(
      rows[0]?.kind === 'group' ? rows[0].todos.map((t) => t.uid) : [],
    ).toEqual(['eggs', 'milk'])
    expect(rows[1]).toMatchObject({ kind: 'todo' })
  })

  // The caller has already sorted by due time; regrouping to the end
  // would move a row that was placed by time to somewhere meaningless.
  it('puts the group where its first todo was', () => {
    const rows = groupTodos(
      [todo('report', 'w'), todo('eggs', 'g'), todo('milk', 'g')],
      LISTS,
    )
    expect(rows.map((r) => r.kind)).toEqual(['todo', 'group'])
  })

  it('groups a single todo, so the row is always the same shape', () => {
    const rows = groupTodos([todo('eggs', 'g')], LISTS)
    expect(rows[0]).toMatchObject({ kind: 'group' })
  })

  it('leaves a non-grouping list ungrouped however many todos it has', () => {
    const rows = groupTodos([todo('a', 'w'), todo('b', 'w')], LISTS)
    expect(rows.map((r) => r.kind)).toEqual(['todo', 'todo'])
  })

  it('draws a todo whose list is unknown on its own', () => {
    // A todo can outlive knowledge of its list mid-sync. Falling back to
    // an ungrouped row keeps it visible rather than dropping it.
    const rows = groupTodos([todo('orphan', 'gone')], LISTS)
    expect(rows).toEqual([{ kind: 'todo', todo: todo('orphan', 'gone') }])
  })

  it('keeps two grouping lists apart', () => {
    const lists = [...LISTS, list('s', 'Shopping')]
    const rows = groupTodos([todo('eggs', 'g'), todo('socks', 's')], lists)
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.kind === 'group')).toBe(true)
  })
})

// docs/specs/list-kinds.md — health first.
describe('partitionFirst', () => {
  const lists = [list('h', 'Health'), list('w', 'Work'), list('g', 'Groceries')]

  it('lifts a health list out, leaving everything else behind', () => {
    const todos = [
      todo('report', 'w'),
      todo('tablets', 'h'),
      todo('eggs', 'g'),
      todo('physio', 'h'),
    ]
    const { first, rest } = partitionFirst(todos, lists)
    expect(first.map((t) => t.uid)).toEqual(['tablets', 'physio'])
    expect(rest.map((t) => t.uid)).toEqual(['report', 'eggs'])
  })

  // The caller has already sorted; a partition must not reorder within
  // either half or it would undo that.
  it('keeps each half in the order it was given', () => {
    const todos = [todo('c', 'h'), todo('a', 'h'), todo('b', 'h')]
    expect(partitionFirst(todos, lists).first.map((t) => t.uid)).toEqual([
      'c',
      'a',
      'b',
    ])
  })

  it('lifts nothing when no list is a health list', () => {
    const todos = [todo('report', 'w'), todo('eggs', 'g')]
    const { first, rest } = partitionFirst(todos, lists)
    expect(first).toEqual([])
    expect(rest).toHaveLength(2)
  })

  it('leaves a todo whose list is unknown in the main block', () => {
    const { first, rest } = partitionFirst([todo('orphan', 'gone')], lists)
    expect(first).toEqual([])
    expect(rest).toHaveLength(1)
  })

  it('is unaffected by a high priority elsewhere', () => {
    // Unconditional, not a weighting: a high-priority chore does not
    // outrank a health todo (docs/specs/list-kinds.md).
    const todos = [
      { ...todo('urgent', 'w'), priority: 'high' as const },
      todo('tablets', 'h'),
    ]
    expect(partitionFirst(todos, lists).first.map((t) => t.uid)).toEqual([
      'tablets',
    ])
  })
})

describe('leadsDerivedViews', () => {
  const lists = [list('h', 'Health'), list('w', 'Work')]

  it('is true only for a todo in a leading list', () => {
    expect(leadsDerivedViews(todo('a', 'h'), lists)).toBe(true)
    expect(leadsDerivedViews(todo('b', 'w'), lists)).toBe(false)
    expect(leadsDerivedViews(todo('c', 'gone'), lists)).toBe(false)
  })
})
