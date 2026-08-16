import type { Todo, TodoList } from '@fold/schemas'
import { describe, expect, it } from 'vitest'
import {
  isNarrowed,
  loadListFilter,
  serialiseListFilter,
  toggleList,
  visibleLists,
  visibleTodos,
} from './list-filter'

const list = (id: string): TodoList => ({
  id,
  href: `/${id}`,
  displayName: id,
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

const LISTS = [list('work'), list('home'), list('health')]

// docs/specs/list-filter.md — the stored set names the *hidden* lists.
describe('visibleLists', () => {
  it('shows everything when there is no filter', () => {
    expect(visibleLists(LISTS, null)).toHaveLength(3)
  })

  it('hides the lists the filter names', () => {
    const shown = visibleLists(LISTS, new Set(['home', 'health']))
    expect(shown.map((l) => l.id)).toEqual(['work'])
  })

  // The one failure this feature must not have: a filter set last week
  // silently swallowing a list made today. Storing what to *hide* is what
  // buys this — a new list is simply not in the set.
  it('shows a list created after the filter was set', () => {
    const later = [...LISTS, list('garden')]
    const shown = visibleLists(later, new Set(['home', 'health']))
    expect(shown.map((l) => l.id)).toEqual(['work', 'garden'])
  })

  // A filter outlives the lists in it — one can be deleted here or by
  // another client — and an id naming nothing simply hides nothing.
  it('ignores ids that no longer name a list', () => {
    const shown = visibleLists(LISTS, new Set(['home', 'deleted-elsewhere']))
    expect(shown.map((l) => l.id)).toEqual(['work', 'health'])
  })

  it('never empties the view, even if every list is hidden', () => {
    // Unreachable by clicking (toggleList clears instead), but reachable
    // by deleting lists until only hidden ones remain. An empty view with
    // an invisible cause is the worst possible outcome here.
    const shown = visibleLists(LISTS, new Set(['work', 'home', 'health']))
    expect(shown).toHaveLength(3)
  })
})

describe('visibleTodos', () => {
  const TODOS = [
    todo('report', 'work'),
    todo('dishes', 'home'),
    todo('tablets', 'health'),
  ]

  it('keeps everything when there is no filter', () => {
    expect(visibleTodos(TODOS, LISTS, null)).toHaveLength(3)
  })

  it('drops todos from hidden lists', () => {
    const shown = visibleTodos(TODOS, LISTS, new Set(['home', 'health']))
    expect(shown.map((t) => t.uid)).toEqual(['report'])
  })

  it('keeps a todo whose list is unknown', () => {
    // Matches groupTodos and partitionHealth: an unresolvable list is a
    // reason to draw the todo plainly, never a reason to hide it.
    const orphan = todo('stray', 'vanished')
    const shown = visibleTodos(
      [...TODOS, orphan],
      LISTS,
      new Set(['home', 'health']),
    )
    expect(shown.map((t) => t.uid)).toEqual(['report', 'stray'])
  })
})

describe('toggleList', () => {
  it('unticking the first box hides just that list', () => {
    const next = toggleList(null, LISTS, 'work')
    expect([...(next ?? [])]).toEqual(['work'])
    expect(visibleLists(LISTS, next).map((l) => l.id)).toEqual([
      'home',
      'health',
    ])
  })

  it('ticking a box back shows the list again', () => {
    const next = toggleList(new Set(['work', 'home']), LISTS, 'home')
    expect([...(next ?? [])]).toEqual(['work'])
  })

  it('clears the filter once nothing is hidden', () => {
    // One representation of "no filter", so the header and storage have a
    // single thing to test against.
    expect(toggleList(new Set(['work']), LISTS, 'work')).toBeNull()
  })

  it('clears the filter rather than hiding everything', () => {
    // "Hide all of my lists" has one sensible reading, and an empty
    // filtered view is not it.
    const next = toggleList(new Set(['work', 'home']), LISTS, 'health')
    expect(next).toBeNull()
  })
})

describe('isNarrowed', () => {
  it('is false without a filter', () => {
    expect(isNarrowed(LISTS, null)).toBe(false)
  })

  it('is true while lists are hidden', () => {
    expect(isNarrowed(LISTS, new Set(['work']))).toBe(true)
  })

  it('is false when the filter names lists that no longer exist', () => {
    // It narrows nothing, so the header must not say that it does.
    expect(isNarrowed(LISTS, new Set(['long-gone']))).toBe(false)
  })
})

describe('storage', () => {
  it('round-trips a filter', () => {
    const filter = new Set(['work', 'home'])
    const stored = serialiseListFilter(filter)
    expect(stored).not.toBeNull()
    expect([...(loadListFilter(stored) ?? [])].toSorted()).toEqual([
      'home',
      'work',
    ])
  })

  it('stores nothing for no filter', () => {
    expect(serialiseListFilter(null)).toBeNull()
  })

  // A corrupt value must never be able to hide todos — the safe direction
  // is a filter you have to set again.
  it('treats unusable stored values as no filter', () => {
    expect(loadListFilter(null)).toBeNull()
    expect(loadListFilter('')).toBeNull()
    expect(loadListFilter('not json')).toBeNull()
    expect(loadListFilter('{"lists":["work"]}')).toBeNull()
    expect(loadListFilter('[]')).toBeNull()
    expect(loadListFilter('[1,2,3]')).toBeNull()
  })

  it('keeps the string ids out of a mixed array', () => {
    expect([...(loadListFilter('["work",7,null]') ?? [])]).toEqual(['work'])
  })
})
