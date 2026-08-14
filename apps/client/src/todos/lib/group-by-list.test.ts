import type { Todo, TodoList } from '@fold/schemas'
import { describe, expect, it } from 'vitest'
import { groupTodos, isHealthTodo, partitionHealth } from './group-by-list'

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

  // docs/specs/list-kinds.md — groups lead. A group row navigates rather
  // than completes and stands for an errand rather than a task, so its
  // position carries none of the due-time meaning a todo row's does.
  // *(changed 2026-08-14, issue #59: was placed at its first todo.)*
  it('leads with the group, whatever position its first todo held', () => {
    const rows = groupTodos(
      [todo('report', 'w'), todo('eggs', 'g'), todo('milk', 'g')],
      LISTS,
    )
    expect(rows.map((r) => r.kind)).toEqual(['group', 'todo'])
  })

  it('keeps the ungrouped todos in the order they arrived', () => {
    const rows = groupTodos(
      [todo('a', 'w'), todo('eggs', 'g'), todo('b', 'w')],
      LISTS,
    )
    expect(
      rows.flatMap((r) => (r.kind === 'todo' ? [r.todo.uid] : ['Groceries'])),
    ).toEqual(['Groceries', 'a', 'b'])
  })

  // Two grouping lists keep their relative order, so the block above the
  // todos is itself stable rather than reshuffling as items are ticked.
  it('orders several groups by first appearance among themselves', () => {
    const lists = [...LISTS, list('s', 'Shopping')]
    const rows = groupTodos(
      [todo('report', 'w'), todo('socks', 's'), todo('eggs', 'g')],
      lists,
    )
    expect(rows.map((r) => (r.kind === 'group' ? r.listName : 'todo'))).toEqual(
      ['Shopping', 'Groceries', 'todo'],
    )
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
describe('partitionHealth', () => {
  const lists = [list('h', 'Health'), list('w', 'Work'), list('g', 'Groceries')]

  it('lifts a health list out, leaving everything else behind', () => {
    const todos = [
      todo('report', 'w'),
      todo('tablets', 'h'),
      todo('eggs', 'g'),
      todo('physio', 'h'),
    ]
    const { health, rest } = partitionHealth(todos, lists)
    expect(health.map((t) => t.uid)).toEqual(['tablets', 'physio'])
    expect(rest.map((t) => t.uid)).toEqual(['report', 'eggs'])
  })

  // The caller has already sorted; a partition must not reorder within
  // either half or it would undo that.
  it('keeps each half in the order it was given', () => {
    const todos = [todo('c', 'h'), todo('a', 'h'), todo('b', 'h')]
    expect(partitionHealth(todos, lists).health.map((t) => t.uid)).toEqual([
      'c',
      'a',
      'b',
    ])
  })

  it('lifts nothing when no list is a health list', () => {
    const todos = [todo('report', 'w'), todo('eggs', 'g')]
    const { health, rest } = partitionHealth(todos, lists)
    expect(health).toEqual([])
    expect(rest).toHaveLength(2)
  })

  it('leaves a todo whose list is unknown in the main block', () => {
    const { health, rest } = partitionHealth([todo('orphan', 'gone')], lists)
    expect(health).toEqual([])
    expect(rest).toHaveLength(1)
  })

  it('is unaffected by a high priority elsewhere', () => {
    // Unconditional, not a weighting: a high-priority chore does not
    // outrank a health todo (docs/specs/list-kinds.md).
    const todos = [
      { ...todo('urgent', 'w'), priority: 'high' as const },
      todo('tablets', 'h'),
    ]
    expect(partitionHealth(todos, lists).health.map((t) => t.uid)).toEqual([
      'tablets',
    ])
  })
})

describe('isHealthTodo', () => {
  const lists = [list('h', 'Health'), list('w', 'Work')]

  it('is true only for a todo in a leading list', () => {
    expect(isHealthTodo(todo('a', 'h'), lists)).toBe(true)
    expect(isHealthTodo(todo('b', 'w'), lists)).toBe(false)
    expect(isHealthTodo(todo('c', 'gone'), lists)).toBe(false)
  })
})
