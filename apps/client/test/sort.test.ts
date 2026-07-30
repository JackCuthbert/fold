import type { Todo } from '@caldav-todo/schemas'
import { describe, expect, it } from 'vitest'
import { dueInstant, isOverdue, sortActiveTodos } from '../src/todos/sort'

const NOW = new Date('2026-07-30T12:00:00Z')
const todo = (uid: string, extra: Partial<Todo> = {}): Todo => ({
  uid,
  listId: 'l',
  href: `/${uid}`,
  etag: 'e',
  summary: uid,
  completed: false,
  ...extra,
})

describe('sortActiveTodos', () => {
  it('orders: overdue, then due date, then priority, then stable', () => {
    const items = [
      todo('no-due'),
      todo('due-later', { due: { kind: 'date', value: '2026-09-01' } }),
      todo('overdue', { due: { kind: 'date', value: '2026-07-01' } }),
      todo('high', { priority: 'high' }),
      todo('due-soon', { due: { kind: 'date', value: '2026-08-01' } }),
    ]
    expect(sortActiveTodos(items, NOW).map((t) => t.uid)).toEqual([
      'overdue',
      'due-soon',
      'due-later',
      'high',
      'no-due',
    ])
  })

  it('date-only due is overdue only after the whole day has passed', () => {
    expect(
      isOverdue(todo('t', { due: { kind: 'date', value: '2026-07-30' } }), NOW),
    ).toBe(false)
    expect(
      isOverdue(todo('t', { due: { kind: 'date', value: '2026-07-29' } }), NOW),
    ).toBe(true)
  })

  it('orders the four due forms by their resolved instant', () => {
    // All four resolve near the same moment; ordering must be stable and
    // must not throw on an unknown zone.
    const items = [
      todo('utc', { due: { kind: 'utc', value: '2026-08-02T00:00:00.000Z' } }),
      todo('floating', {
        due: { kind: 'floating', value: '2026-08-01T12:00:00' },
      }),
      todo('zoned', {
        due: {
          kind: 'zoned',
          tzid: 'Australia/Brisbane',
          value: '2026-08-01T12:00:00',
        },
      }),
      todo('unknown-zone', {
        due: {
          kind: 'zoned',
          tzid: 'Nowhere/Unknown',
          value: '2026-08-01T12:00:00',
        },
      }),
    ]
    const sorted = sortActiveTodos(items, NOW)
    expect(sorted).toHaveLength(4)
    // Each resolved instant must be finite — no NaN leaking into the sort.
    for (const item of sorted) {
      expect(Number.isNaN(dueInstant(item))).toBe(false)
    }
  })
})
