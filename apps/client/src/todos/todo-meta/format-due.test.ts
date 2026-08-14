import type { Todo } from '@fold/schemas'
import { describe, expect, it } from 'vitest'
import { formatDue } from '../todo-meta/todo-meta'

const todo = (due: Todo['due']): Todo => ({
  uid: 'u',
  listId: 'l',
  href: '/u',
  etag: 'e',
  summary: 'u',
  completed: false,
  ...(due ? { due } : {}),
})

// docs/specs/todos.md — due times: display must branch on the stored form,
// not on the resolved ordering instant.
describe('formatDue', () => {
  it('shows no time for an all-day todo', () => {
    // The ordering rule resolves an all-day date to 23:59:59 local, so
    // formatting the instant unconditionally would render "11:59 pm" on
    // every all-day todo. This is the regression this test exists for.
    const formatted = formatDue(todo({ kind: 'date', value: '2026-08-10' }))
    expect(formatted).not.toMatch(/\d:\d\d/)
    expect(formatted).toBeTruthy()
  })

  it('shows a time for a zoned todo', () => {
    const formatted = formatDue(
      todo({
        kind: 'zoned',
        tzid: 'Australia/Brisbane',
        value: '2026-08-10T09:00:00',
      }),
    )
    expect(formatted).toMatch(/\d:\d\d/)
  })

  it('shows a time for a floating todo', () => {
    expect(
      formatDue(todo({ kind: 'floating', value: '2026-08-10T09:00:00' })),
    ).toMatch(/\d:\d\d/)
  })

  it('is null when there is no due date', () => {
    expect(formatDue(todo(undefined))).toBeNull()
  })
})

// A row must not read as a date eight months past when it is four months
// future. "15 May" is the same string whichever year it belongs to, so the
// year has to appear when it is not the current one — the same rule the
// Summary's day headings already follow (todos/lib/summary.ts).
// *(added 2026-08-14, found in review.)*
describe('a due date in another year', () => {
  it('names the year, and still omits it for this one', () => {
    const nextYear = String(new Date().getFullYear() + 1)
    const thisYear = String(new Date().getFullYear())
    expect(
      formatDue(todo({ kind: 'date', value: `${nextYear}-05-15` })),
    ).toContain(nextYear)
    expect(
      formatDue(todo({ kind: 'date', value: `${thisYear}-05-15` })),
    ).not.toContain(thisYear)
  })
})
