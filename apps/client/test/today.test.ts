import type { Todo } from '@fold/schemas'
import { describe, expect, it } from 'vitest'
import {
  isTodayView,
  selectToday,
  sortByDueInstant,
  TODAY_VIEW,
} from '../src/todos/today'

const NOW = new Date('2026-08-10T12:00:00')

const todo = (uid: string, extra: Partial<Todo> = {}): Todo => ({
  uid,
  listId: 'l',
  href: `/${uid}`,
  etag: 'e',
  summary: uid,
  completed: false,
  ...extra,
})

// docs/specs/today-view.md
describe('TODAY_VIEW sentinel', () => {
  it('cannot collide with a real list id', () => {
    // List ids are collection href path segments (tsdav-gateway.ts —
    // `listIdFromHref`), so a bare word like 'today' is a perfectly valid
    // one; the author's own server has exactly that. The sentinel must not
    // be a value the server could ever produce.
    expect(TODAY_VIEW).not.toBe('today')
    expect(TODAY_VIEW).toContain(':')
    expect(isTodayView('today')).toBe(false)
    expect(isTodayView(TODAY_VIEW)).toBe(true)
    expect(isTodayView(null)).toBe(false)
  })
})

describe('selectToday', () => {
  it('includes todos due later today', () => {
    const items = [
      todo('this-afternoon', {
        due: { kind: 'floating', value: '2026-08-10T17:00:00' },
      }),
    ]
    expect(selectToday(items, NOW).map((t) => t.uid)).toEqual([
      'this-afternoon',
    ])
  })

  it('keeps overdue todos rather than letting them vanish', () => {
    // The whole point of including overdue: a todo missed yesterday must
    // still be visible today, not findable only by opening its own list.
    const items = [
      todo('yesterday', { due: { kind: 'date', value: '2026-08-09' } }),
      todo('last-week', { due: { kind: 'date', value: '2026-08-03' } }),
    ]
    expect(selectToday(items, NOW).map((t) => t.uid)).toEqual([
      'yesterday',
      'last-week',
    ])
  })

  it('excludes todos due after today', () => {
    const items = [
      todo('tomorrow', { due: { kind: 'date', value: '2026-08-11' } }),
      todo('next-month', { due: { kind: 'date', value: '2026-09-01' } }),
    ]
    expect(selectToday(items, NOW)).toEqual([])
  })

  it('excludes todos with no due date', () => {
    expect(selectToday([todo('someday')], NOW)).toEqual([])
  })

  it('includes an all-day todo due today, all day long', () => {
    // An all-day date resolves to the end of its local day, so it must
    // still count as "today" at 12:00 — and at 23:00.
    const items = [
      todo('all-day', { due: { kind: 'date', value: '2026-08-10' } }),
    ]
    expect(selectToday(items, NOW)).toHaveLength(1)
    expect(selectToday(items, new Date('2026-08-10T23:00:00'))).toHaveLength(1)
  })
})

describe('sortByDueInstant', () => {
  it('orders by time, putting overdue first', () => {
    const items = [
      todo('5pm', {
        due: { kind: 'floating', value: '2026-08-10T17:00:00' },
      }),
      todo('overdue', { due: { kind: 'date', value: '2026-08-09' } }),
      todo('9am', {
        due: { kind: 'floating', value: '2026-08-10T09:00:00' },
      }),
    ]
    expect(sortByDueInstant(items).map((t) => t.uid)).toEqual([
      'overdue',
      '9am',
      '5pm',
    ])
  })

  it('is stable, so an incoming order survives equal instants', () => {
    const due = { kind: 'date' as const, value: '2026-08-10' }
    const items = [todo('a', { due }), todo('b', { due }), todo('c', { due })]
    expect(sortByDueInstant(items).map((t) => t.uid)).toEqual(['a', 'b', 'c'])
    expect(sortByDueInstant(items.toReversed()).map((t) => t.uid)).toEqual([
      'c',
      'b',
      'a',
    ])
  })
})
