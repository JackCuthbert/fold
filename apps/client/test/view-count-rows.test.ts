import type { Todo, TodoList } from '@fold/schemas'
import { describe, expect, it } from 'vitest'
import { countSummary } from '../src/todos/count-summary'
import { countableRows } from '../src/todos/use-view-count'

const list = (id: string, displayName: string): TodoList => ({
  id,
  href: `/${id}`,
  displayName,
  ctag: 'c',
})

const todo = (uid: string, listId: string, completed = false): Todo => ({
  uid,
  listId,
  href: `/${uid}`,
  etag: 'e',
  summary: uid,
  completed,
})

const LISTS = [list('g', 'Groceries'), list('w', 'Work')]

// docs/specs/list-kinds.md — the header count describes the rows on
// screen, not every todo behind them.
describe('countableRows', () => {
  it('counts a grouped list once, however many todos it holds', () => {
    const todos = [
      todo('eggs', 'g'),
      todo('bread', 'g'),
      todo('milk', 'g'),
      todo('report', 'w'),
    ]
    // Two rows on screen — the Groceries group and the one Work todo —
    // so "2 todos", not "4 todos".
    expect(countableRows(todos, LISTS)).toHaveLength(2)
    expect(countSummary(countableRows(todos, LISTS))).toBe('2 todos')
  })

  it('reads a group as outstanding while any todo in it is', () => {
    // The row is struck through only when the group is wholly finished
    // (group-row.tsx), so the count has to agree — otherwise the header
    // says "done" about a row that does not look done.
    const todos = [
      todo('eggs', 'g', true),
      todo('bread', 'g', false),
      todo('report', 'w', true),
    ]
    expect(countSummary(countableRows(todos, LISTS))).toBe('1 todo · 1 done')
  })

  it('reads a wholly finished group as done', () => {
    const todos = [todo('eggs', 'g', true), todo('bread', 'g', true)]
    expect(countSummary(countableRows(todos, LISTS))).toBe('1 done')
  })

  it('leaves an ungrouped view counting todos', () => {
    const todos = [todo('a', 'w'), todo('b', 'w', true)]
    expect(countableRows(todos, LISTS)).toHaveLength(2)
    expect(countSummary(countableRows(todos, LISTS))).toBe('1 todo · 1 done')
  })

  // Health todos are lifted into their own block in Today
  // (docs/specs/list-kinds.md), which puts them outside the grouped list
  // the rest of the view renders — but they are still rows on the screen,
  // so the header has to keep counting them.
  it('counts health rows, which render outside the main list', () => {
    const lists = [...LISTS, list('h', 'Health')]
    const todos = [todo('tablets', 'h'), todo('eggs', 'g'), todo('bread', 'g')]
    // Two rows: the health todo, and the Groceries group.
    expect(countableRows(todos, lists)).toHaveLength(2)
    expect(countSummary(countableRows(todos, lists))).toBe('2 todos')
  })
})
