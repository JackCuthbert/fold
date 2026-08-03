import type { Todo } from '@fold/schemas'
import { describe, expect, it } from 'vitest'
import { dayLabel, localDayOf, summariseCompleted } from '../src/todos/summary'

const done = (uid: string, completedAt?: string): Todo => ({
  uid,
  listId: 'l',
  href: `/${uid}`,
  etag: 'e',
  summary: uid,
  completed: true,
  ...(completedAt ? { completedAt } : {}),
})

const open = (uid: string): Todo => ({
  uid,
  listId: 'l',
  href: `/${uid}`,
  etag: 'e',
  summary: uid,
  completed: false,
})

// docs/specs/summary-view.md
describe('summariseCompleted', () => {
  it('groups by the local day of completion, most recent first', () => {
    // Local wall-clock times, so the test reads the same in any zone.
    const result = summariseCompleted([
      done('mon-am', new Date(2026, 7, 3, 9, 0).toISOString()),
      done('tue', new Date(2026, 7, 4, 9, 0).toISOString()),
      done('mon-pm', new Date(2026, 7, 3, 17, 0).toISOString()),
    ])
    expect(result.days.map((d) => d.day)).toEqual(['2026-08-04', '2026-08-03'])
    // Within a day: most recently completed first.
    expect(result.days[1]?.todos.map((t) => t.uid)).toEqual([
      'mon-pm',
      'mon-am',
    ])
  })

  it('buckets by local day, not UTC day', () => {
    // The trap: 9pm local is the *next* UTC day east of Greenwich, so
    // grouping on toISOString() would file this under tomorrow. Build the
    // instant from local components and assert it lands on its local day.
    const lateEvening = new Date(2026, 7, 3, 21, 30)
    const result = summariseCompleted([done('late', lateEvening.toISOString())])
    expect(result.days.map((d) => d.day)).toEqual(['2026-08-03'])
  })

  it('ignores todos that are not completed', () => {
    const result = summariseCompleted([
      open('still-going'),
      done('finished', new Date(2026, 7, 3, 9, 0).toISOString()),
    ])
    expect(result.days).toHaveLength(1)
    expect(result.days[0]?.todos.map((t) => t.uid)).toEqual(['finished'])
  })

  it('counts completed todos with no timestamp rather than guessing a day', () => {
    // Another client may set STATUS:COMPLETED without COMPLETED — RFC 5545
    // does not require it. Those can't be placed, and must not be silently
    // dropped either.
    const result = summariseCompleted([
      done('no-stamp'),
      done('stamped', new Date(2026, 7, 3, 9, 0).toISOString()),
    ])
    expect(result.undated).toBe(1)
    expect(result.days).toHaveLength(1)
  })

  it('treats a malformed timestamp as unplaceable', () => {
    expect(summariseCompleted([done('bad', 'not-a-date')]).undated).toBe(1)
  })

  it('is empty when nothing is completed', () => {
    expect(summariseCompleted([open('a')])).toEqual({ days: [], undated: 0 })
  })
})

describe('dayLabel', () => {
  const now = new Date(2026, 7, 4, 12, 0)

  it('names the two most recent days relatively', () => {
    expect(dayLabel(localDayOf(now), now)).toBe('Today')
    expect(dayLabel('2026-08-03', now)).toBe('Yesterday')
  })

  it('uses an absolute date beyond yesterday', () => {
    const label = dayLabel('2026-08-01', now)
    expect(label).not.toBe('Today')
    expect(label).not.toBe('Yesterday')
    // Whatever the locale, it names that date — not the day before, which
    // is what parsing '2026-08-01' as UTC would produce west of Greenwich.
    expect(label).toContain('1')
  })

  it('names the year only when it differs from now', () => {
    expect(dayLabel('2026-08-01', now)).not.toContain('2026')
    expect(dayLabel('2025-08-01', now)).toContain('2025')
  })
})
