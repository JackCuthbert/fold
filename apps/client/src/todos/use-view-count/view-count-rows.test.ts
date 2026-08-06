import type { Todo, TodoList } from '@fold/schemas'
import { describe, expect, it } from 'vitest'
import { countSummary } from '../count-summary/count-summary'
import { countableRows } from './use-view-count'

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

  it('splits a part-done group across both halves', () => {
    // A grocery list with some items ticked renders *two* group rows — one
    // outstanding above, one struck through in the Completed section — so
    // the count reports one of each. This test previously asserted "1 todo
    // · 1 done" for the same input, on the mistaken belief that a group is
    // one row across the whole view; it is one row per half, because that
    // is how the pane draws it. *(corrected 2026-08-05.)*
    const todos = [
      todo('eggs', 'g', true),
      todo('bread', 'g', false),
      todo('report', 'w', true),
    ]
    // Groceries outstanding, then Groceries done + the work todo.
    expect(countSummary(countableRows(todos, LISTS))).toBe('1 todo · 2 done')
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
  // The case CI hit: unrelated todos, active and completed, sharing the
  // view with a grouped list. The group still contributes exactly one row
  // whatever else is present — which is what the e2e used to assert with a
  // literal "2 todos", and could not, since Today spans every list on a
  // shared server. *(added 2026-08-05.)*
  it('counts a group once amid unrelated active and completed todos', () => {
    const todos = [
      todo('eggs', 'g'),
      todo('bread', 'g'),
      todo('milk', 'g'),
      todo('report', 'w'),
      todo('someone-elses', 'w'),
      todo('finished', 'w', true),
    ]
    // Four rows: the Groceries group, two work todos, one done.
    expect(countableRows(todos, LISTS)).toHaveLength(4)
    expect(countSummary(countableRows(todos, LISTS))).toBe('3 todos · 1 done')
  })

  // Today draws its active and completed rows as two separate lists, each
  // grouped on its own — so a list with both produces *two* group rows.
  // Grouping the whole slice at once collapses them into one and
  // undercounts. *(added 2026-08-05.)*
  it('counts a grouped list once per half when it has both', () => {
    const todos = [
      todo('eggs', 'g'),
      todo('bread', 'g'),
      todo('milk', 'g', true),
      todo('butter', 'g', true),
    ]
    // Two rows on screen: one Groceries group above, one in Completed.
    expect(countSummary(countableRows(todos, LISTS))).toBe('1 todo · 1 done')
  })

  it('counts health rows, which render outside the main list', () => {
    const lists = [...LISTS, list('h', 'Health')]
    const todos = [todo('tablets', 'h'), todo('eggs', 'g'), todo('bread', 'g')]
    // Two rows: the health todo, and the Groceries group.
    expect(countableRows(todos, lists)).toHaveLength(2)
    expect(countSummary(countableRows(todos, lists))).toBe('2 todos')
  })
})
