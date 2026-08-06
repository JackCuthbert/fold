import type { Todo } from '@fold/schemas'
import { describe, expect, it } from 'vitest'
import {
  isSearchable,
  MIN_QUERY_LENGTH,
  searchTodos,
} from '../src/todos/search'

const todo = (uid: string, extra: Partial<Todo> = {}): Todo => ({
  uid,
  listId: 'l',
  href: `/${uid}`,
  etag: 'e',
  summary: uid,
  completed: false,
  ...extra,
})

// docs/specs/search-view.md
describe('searchTodos', () => {
  it('finds a todo by a word in its summary', () => {
    const todos = [
      todo('a', { summary: 'Buy milk' }),
      todo('b', { summary: 'Book flights' }),
    ]
    expect(searchTodos(todos, 'milk').map((t) => t.uid)).toEqual(['a'])
  })

  it('forgives a typo, which is the point of being fuzzy', () => {
    const todos = [todo('a', { summary: 'Dentist appointment' })]
    // An exact-match search would find nothing here, and the user would
    // have to spell it right to find the thing they cannot remember the
    // spelling of.
    expect(searchTodos(todos, 'dentst')).toHaveLength(1)
  })

  it('searches descriptions, not only summaries', () => {
    const todos = [
      todo('a', {
        summary: 'Call the bank',
        description: 'ask about the overdraft fee on the joint account',
      }),
      todo('b', { summary: 'Water the plants' }),
    ]
    // The detail you half-remember is often in the note rather than the
    // title — the issue asks for this explicitly.
    expect(searchTodos(todos, 'overdraft').map((t) => t.uid)).toEqual(['a'])
  })

  it('ranks a summary match above a description-only match', () => {
    const todos = [
      todo('note', { summary: 'Tidy the garage', description: 'buy milk' }),
      todo('title', { summary: 'Buy milk' }),
    ]
    // Someone searching "milk" wants the todo *called* milk. Both match,
    // so this is about the weighting rather than about inclusion.
    expect(searchTodos(todos, 'milk')[0]?.uid).toBe('title')
  })

  it('includes completed todos', () => {
    const todos = [todo('a', { summary: 'Renew passport', completed: true })]
    // The one you are hunting for is disproportionately likely to be
    // finished and half-forgotten. A search that hid them would answer "no
    // results" for something that is right there.
    expect(searchTodos(todos, 'passport')).toHaveLength(1)
  })

  it('searches every list it is given, without preferring any', () => {
    const todos = [
      todo('a', { listId: 'work', summary: 'Quarterly report' }),
      todo('b', { listId: 'home', summary: 'Report a repair' }),
    ]
    // No list kind gets special treatment (docs/specs/list-kinds.md
    // describes display rules, not search ones), so both lists answer.
    expect(searchTodos(todos, 'report')).toHaveLength(2)
  })

  it('returns nothing until the query is long enough', () => {
    const todos = [todo('a', { summary: 'Milk' })]
    // Not "everything": one character matches most of a corpus fuzzily, so
    // the result would be the whole list in a strange order — noise
    // dressed as an answer. Empty is honest, and the pane says why.
    expect(searchTodos(todos, '')).toEqual([])
    expect(searchTodos(todos, 'm')).toEqual([])
    expect(searchTodos(todos, 'mi')).toHaveLength(1)
  })

  it('ignores surrounding whitespace', () => {
    const todos = [todo('a', { summary: 'Milk' })]
    // A trailing space from typing or a paste must not change the answer,
    // and must not count towards the minimum length either.
    expect(searchTodos(todos, '  milk  ')).toHaveLength(1)
    expect(searchTodos(todos, ' m ')).toEqual([])
  })

  it('does not mutate the todos it is given', () => {
    const todos = [todo('a', { summary: 'Milk' }), todo('b')]
    const before = [...todos]
    searchTodos(todos, 'milk')
    // Fuse sorts its own copy; the caller's array is the query cache's
    // data in practice, so reordering it in place would be a real bug.
    expect(todos).toEqual(before)
  })
})

describe('isSearchable', () => {
  it('agrees with the minimum the search itself enforces', () => {
    // Two callers depend on this being the same rule: the pane picks which
    // message to show, and the count line stays silent until a search has
    // actually run. If they disagreed, the header would announce "No
    // todos" over a prompt telling you to keep typing.
    expect(isSearchable('m')).toBe(false)
    expect(isSearchable('mi')).toBe(true)
    expect(isSearchable(' '.repeat(MIN_QUERY_LENGTH))).toBe(false)
  })
})
