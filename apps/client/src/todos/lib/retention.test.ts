import type { Todo } from '@fold/schemas'
import { describe, expect, it } from 'vitest'
import {
  countClearable,
  isClearableAsOld,
  RETENTION_DAYS,
  retentionCutoff,
  todosToClear,
} from './retention'

const NOW = new Date('2026-08-09T10:00:00.000Z')
const CUTOFF = retentionCutoff(NOW)

const todo = (over: Partial<Todo>): Todo => ({
  uid: 'u1',
  listId: 'list-a',
  href: '/list-a/u1.ics',
  etag: '"1"',
  summary: 'A todo',
  completed: true,
  ...over,
})

/** `days` ago from NOW, as the ISO instant `completedAt` carries. */
const completedDaysAgo = (days: number): string => {
  const when = new Date(NOW)
  when.setDate(when.getDate() - days)
  return when.toISOString()
}

describe('the retention window', () => {
  it('cuts off exactly RETENTION_DAYS before now', () => {
    const expected = new Date(NOW)
    expected.setDate(expected.getDate() - RETENTION_DAYS)
    expect(CUTOFF.toISOString()).toBe(expected.toISOString())
  })

  // The guarantee the whole design rests on: what Summary still shows can
  // never be cleared by the safe action.
  it('treats anything inside the window as not old', () => {
    for (const days of [0, 1, 15, RETENTION_DAYS - 1]) {
      const recent = todo({ completedAt: completedDaysAgo(days) })
      expect(isClearableAsOld(recent, CUTOFF)).toBe(false)
    }
  })

  it('treats anything past the window as old', () => {
    for (const days of [RETENTION_DAYS + 1, 90, 400]) {
      const ancient = todo({ completedAt: completedDaysAgo(days) })
      expect(isClearableAsOld(ancient, CUTOFF)).toBe(true)
    }
  })

  // An active todo is not "completed history" at all — no bulk clear of
  // completed work may ever touch outstanding work.
  it('never treats an active todo as clearable', () => {
    const active = todo({ completed: false, completedAt: completedDaysAgo(90) })
    expect(isClearableAsOld(active, CUTOFF)).toBe(false)
  })

  // Issue #39: no timestamp means no age. Assuming "old" would delete work
  // that might have been finished minutes ago by another client.
  it('never treats an undated todo as old, however long it has been there', () => {
    const undated = todo({ completedAt: undefined })
    expect(isClearableAsOld(undated, CUTOFF)).toBe(false)
  })
})

describe('counting what a clear would affect', () => {
  const todos = [
    todo({ uid: 'old-1', completedAt: completedDaysAgo(40) }),
    todo({ uid: 'old-2', completedAt: completedDaysAgo(31) }),
    todo({ uid: 'recent-1', completedAt: completedDaysAgo(2) }),
    todo({ uid: 'undated-1', completedAt: undefined }),
    todo({ uid: 'active-1', completed: false }),
  ]

  it('splits completed work into old, recent and undated', () => {
    expect(countClearable(todos, CUTOFF)).toEqual({
      old: 2,
      recent: 1,
      undated: 1,
    })
  })

  it('clearing old work leaves recent history and undated todos alone', () => {
    const cleared = todosToClear(todos, CUTOFF, 'old').map((t) => t.uid)
    expect(cleared).toEqual(['old-1', 'old-2'])
  })

  // The heavier action still refuses to delete a todo whose age is
  // unknown, and still never touches active work.
  it('clearing everything takes recent work too, but never the undated', () => {
    const cleared = todosToClear(todos, CUTOFF, 'all').map((t) => t.uid)
    expect(cleared).toEqual(['old-1', 'old-2', 'recent-1'])
  })
})
