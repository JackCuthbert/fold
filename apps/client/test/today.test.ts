import type { Todo } from '@fold/schemas'
import { describe, expect, it } from 'vitest'
import {
  addLocalDays,
  DERIVED_VIEWS,
  isTodayView,
  isTomorrowView,
  selectToday,
  selectTomorrow,
  sortByDueInstant,
  SUMMARY_VIEW,
  TODAY_VIEW,
  TOMORROW_VIEW,
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

  // The overdue rule is for work still to be chased. Applied to finished
  // work it turned Today's "Completed" section into an ever-growing
  // archive of every todo ever ticked off.
  it('drops todos completed on a previous day', () => {
    const items = [
      todo('done-last-week', {
        completed: true,
        completedAt: '2026-08-03T09:00:00.000Z',
        due: { kind: 'date', value: '2026-08-03' },
      }),
      todo('done-yesterday', {
        completed: true,
        completedAt: '2026-08-09T09:00:00.000Z',
        due: { kind: 'date', value: '2026-08-09' },
      }),
    ]
    expect(selectToday(items, NOW)).toEqual([])
  })

  it('keeps a todo completed today, even one that was overdue', () => {
    // Finished today is today's work, whenever it happened to be due.
    const items = [
      todo('caught-up', {
        completed: true,
        completedAt: '2026-08-10T09:00:00.000Z',
        due: { kind: 'date', value: '2026-08-01' },
      }),
    ]
    expect(selectToday(items, NOW).map((t) => t.uid)).toEqual(['caught-up'])
  })

  it('falls back to the due date when COMPLETED is absent', () => {
    // Another client may tick a todo without writing COMPLETED. Without a
    // finish time, due-today is the only signal that it belongs here.
    const items = [
      todo('no-timestamp-today', {
        completed: true,
        due: { kind: 'date', value: '2026-08-10' },
      }),
      todo('no-timestamp-old', {
        completed: true,
        due: { kind: 'date', value: '2026-08-02' },
      }),
    ]
    expect(selectToday(items, NOW).map((t) => t.uid)).toEqual([
      'no-timestamp-today',
    ])
  })

  it('still shows active todos from any time in the past', () => {
    // The bound added for completed todos must not narrow the active rule.
    const items = [
      todo('ancient', { due: { kind: 'date', value: '2025-01-01' } }),
    ]
    expect(selectToday(items, NOW).map((t) => t.uid)).toEqual(['ancient'])
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

// docs/specs/tomorrow-view.md
describe('TOMORROW_VIEW sentinel', () => {
  it('cannot collide with a real list id', () => {
    // Same reasoning as TODAY_VIEW above: 'tomorrow' is a perfectly
    // ordinary collection name.
    expect(TOMORROW_VIEW).not.toBe('tomorrow')
    expect(TOMORROW_VIEW).toContain(':')
    expect(isTomorrowView('tomorrow')).toBe(false)
    expect(isTomorrowView(TOMORROW_VIEW)).toBe(true)
    expect(isTomorrowView(null)).toBe(false)
  })

  it('reads in day order, so its chord follows the nav', () => {
    // The order of this list decides both the nav's order and which digit
    // each view answers to (shortcuts.ts — VIEW_SHORTCUTS), so the
    // sequence is load-bearing rather than cosmetic.
    expect([...DERIVED_VIEWS]).toEqual([
      TODAY_VIEW,
      TOMORROW_VIEW,
      SUMMARY_VIEW,
    ])
  })
})

describe('addLocalDays', () => {
  it('rolls the month', () => {
    expect(addLocalDays(new Date('2026-08-31T12:00:00'), 1).getMonth()).toBe(8)
  })

  it('keeps the wall-clock time across a daylight-saving change', () => {
    // Adding 24 hours in milliseconds lands an hour out when the offset
    // shifts, which is enough to push a midnight todo into the wrong day.
    // Sydney's 2026 transition is 5 April.
    const before = new Date('2026-04-04T09:00:00')
    expect(addLocalDays(before, 1).getHours()).toBe(before.getHours())
  })
})

describe('selectTomorrow', () => {
  it('includes todos due tomorrow', () => {
    const items = [
      todo('all-day', { due: { kind: 'date', value: '2026-08-11' } }),
      todo('at-nine', {
        due: { kind: 'floating', value: '2026-08-11T09:00:00' },
      }),
    ]
    expect(selectTomorrow(items, NOW).map((t) => t.uid)).toEqual([
      'all-day',
      'at-nine',
    ])
  })

  it('excludes today, and the day after tomorrow', () => {
    const items = [
      todo('today', { due: { kind: 'date', value: '2026-08-10' } }),
      todo('day-after', { due: { kind: 'date', value: '2026-08-12' } }),
    ]
    expect(selectTomorrow(items, NOW)).toEqual([])
  })

  // The one rule that separates this view from Today. Today keeps overdue
  // work visible because it still needs chasing; that is Today's job, and
  // repeating it here would make Tomorrow a near-copy of it.
  it('never shows overdue work — that is Today’s job', () => {
    const items = [
      todo('yesterday', { due: { kind: 'date', value: '2026-08-09' } }),
      todo('last-year', { due: { kind: 'date', value: '2025-01-01' } }),
    ]
    expect(selectTomorrow(items, NOW)).toEqual([])
  })

  it('excludes todos with no due date', () => {
    expect(selectTomorrow([todo('someday')], NOW)).toEqual([])
  })

  // A completed todo belongs to the day it was *completed*, which is how
  // Today selects and how Summary groups. Ticking tomorrow's work off
  // early therefore moves it to Today rather than keeping it here — the
  // row leaving this view is the correct outcome, not a glitch.
  it('drops work ticked off early, which belongs to the day it was done', () => {
    const items = [
      todo('done-early', {
        completed: true,
        completedAt: '2026-08-10T12:30:00.000Z',
        due: { kind: 'date', value: '2026-08-11' },
      }),
    ]
    expect(selectTomorrow(items, NOW)).toEqual([])
    // ...and it turns up in Today, where the work actually happened.
    expect(selectToday(items, NOW).map((t) => t.uid)).toEqual(['done-early'])
  })

  it('shows outstanding work only, whatever the finish time says', () => {
    // No `completedAt` fallback to reason about: completed is completed,
    // so a todo another client ticked without writing COMPLETED needs no
    // special case here.
    const items = [
      todo('no-timestamp', {
        completed: true,
        due: { kind: 'date', value: '2026-08-11' },
      }),
      todo('still-to-do', { due: { kind: 'date', value: '2026-08-11' } }),
    ]
    expect(selectTomorrow(items, NOW).map((t) => t.uid)).toEqual([
      'still-to-do',
    ])
  })

  it('rolls into the next month at month end', () => {
    const items = [
      todo('first', { due: { kind: 'date', value: '2026-09-01' } }),
    ]
    const lastOfAugust = new Date('2026-08-31T12:00:00')
    expect(selectTomorrow(items, lastOfAugust).map((t) => t.uid)).toEqual([
      'first',
    ])
  })

  it('holds all day, from just after midnight to late evening', () => {
    const items = [
      todo('all-day', { due: { kind: 'date', value: '2026-08-11' } }),
    ]
    expect(selectTomorrow(items, new Date('2026-08-10T00:05:00'))).toHaveLength(
      1,
    )
    expect(selectTomorrow(items, new Date('2026-08-10T23:55:00'))).toHaveLength(
      1,
    )
  })

  // Today and Tomorrow must never show the same todo: they are adjacent
  // windows, and an item in both would read as a duplicate.
  it('never overlaps with Today', () => {
    const items = [
      todo('overdue', { due: { kind: 'date', value: '2026-08-01' } }),
      todo('today', { due: { kind: 'date', value: '2026-08-10' } }),
      todo('tomorrow', { due: { kind: 'date', value: '2026-08-11' } }),
      todo('later', { due: { kind: 'date', value: '2026-08-20' } }),
      todo('undated'),
    ]
    const today = selectToday(items, NOW).map((t) => t.uid)
    const tomorrow = selectTomorrow(items, NOW).map((t) => t.uid)
    expect(today).toEqual(['overdue', 'today'])
    expect(tomorrow).toEqual(['tomorrow'])
    expect(today.filter((uid) => tomorrow.includes(uid))).toEqual([])
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
