import type { TodoList } from '@fold/schemas'
import { describe, expect, it } from 'vitest'
import { byListOrder, nextOrder, reorder } from './list-order'

const list = (id: string, displayName: string, order?: number): TodoList => ({
  id,
  href: `/${id}/`,
  displayName,
  ctag: '1',
  ...(order !== undefined ? { order } : {}),
})

// docs/specs/lists.md — ordering: lists with an order sort by it; lists
// without sort alphabetically *after* them.
describe('byListOrder', () => {
  it('sorts ordered lists by their order', () => {
    const sorted = [list('c', 'C', 3), list('a', 'A', 1), list('b', 'B', 2)]
      .toSorted(byListOrder)
      .map((l) => l.id)
    expect(sorted).toEqual(['a', 'b', 'c'])
  })

  it('puts unordered lists after ordered ones, alphabetically', () => {
    const sorted = [
      list('z', 'Zebra'),
      list('m', 'Mango', 5),
      list('a', 'Apple'),
    ]
      .toSorted(byListOrder)
      .map((l) => l.id)
    expect(sorted).toEqual(['m', 'a', 'z'])
  })

  it('breaks an order tie alphabetically, so the sort is stable', () => {
    const sorted = [list('b', 'Beta', 1), list('a', 'Alpha', 1)]
      .toSorted(byListOrder)
      .map((l) => l.id)
    expect(sorted).toEqual(['a', 'b'])
  })

  it('treats order 0 as a position, not as absent', () => {
    const sorted = [list('b', 'B', 5), list('a', 'A', 0)]
      .toSorted(byListOrder)
      .map((l) => l.id)
    expect(sorted).toEqual(['a', 'b'])
  })
})

// docs/specs/lists.md — a new list must not jump: the client picks the
// order itself so the server never invents one to disagree with.
describe('nextOrder', () => {
  it('is one past the highest existing order', () => {
    expect(nextOrder([list('a', 'A', 1), list('b', 'B', 4)])).toBe(5)
  })

  it('starts at 1 when no list has an order yet', () => {
    expect(nextOrder([list('a', 'A'), list('b', 'B')])).toBe(1)
  })

  it('starts at 1 for an empty nav', () => {
    expect(nextOrder([])).toBe(1)
  })

  it('handles a negative order without going backwards', () => {
    expect(nextOrder([list('a', 'A', -3)])).toBe(-2)
  })
})

// docs/specs/lists.md — reordering writes only the lists that moved.
describe('reorder', () => {
  const lists = [list('a', 'A', 1), list('b', 'B', 2), list('c', 'C', 3)]

  it('swaps a list with the one above it', () => {
    expect(reorder(lists, 'b', 'up')).toEqual([
      { listId: 'b', order: 1 },
      { listId: 'a', order: 2 },
    ])
  })

  it('swaps a list with the one below it', () => {
    expect(reorder(lists, 'b', 'down')).toEqual([
      { listId: 'b', order: 3 },
      { listId: 'c', order: 2 },
    ])
  })

  it('does nothing at the top', () => {
    expect(reorder(lists, 'a', 'up')).toEqual([])
  })

  it('does nothing at the bottom', () => {
    expect(reorder(lists, 'c', 'down')).toEqual([])
  })

  it('assigns orders when neighbours have none', () => {
    // A nav of lists created by another client: nothing has an order yet,
    // so moving one has to give both a real number.
    const plain = [list('a', 'A'), list('b', 'B'), list('c', 'C')]
    const changes = reorder(plain, 'b', 'up')
    expect(changes).toHaveLength(2)
    const moved = changes.find((c) => c.listId === 'b')
    const displaced = changes.find((c) => c.listId === 'a')
    expect(moved?.order).toBeLessThan(displaced?.order ?? 0)
  })
})
