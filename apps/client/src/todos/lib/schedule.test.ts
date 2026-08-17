import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  daysUntilWeekday,
  SATURDAY,
  scheduleDate,
  scheduledDue,
  scheduleIsNoop,
  SUNDAY,
  timeHasPassed,
} from './schedule'
import { viewerTimeZone } from './due-fields'

// docs/specs/todos.md — quick scheduling.

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('scheduleDate', () => {
  it('returns today for offset 0 and tomorrow for offset 1', () => {
    const now = new Date(2026, 7, 11, 14, 30)
    expect(scheduleDate(now, 0)).toBe('2026-08-11')
    expect(scheduleDate(now, 1)).toBe('2026-08-12')
  })

  it('rolls over the end of a month', () => {
    expect(scheduleDate(new Date(2026, 7, 31, 9, 0), 1)).toBe('2026-09-01')
  })

  it('rolls over the end of a year', () => {
    expect(scheduleDate(new Date(2026, 11, 31, 9, 0), 1)).toBe('2027-01-01')
  })

  it('handles a leap day', () => {
    expect(scheduleDate(new Date(2028, 1, 28, 9, 0), 1)).toBe('2028-02-29')
  })

  // The reason this mutates a Date rather than adding 86_400_000ms: a day
  // is 23 or 25 hours across a DST boundary, so millisecond arithmetic
  // lands on the wrong calendar day. Verified against the naive version —
  // on the night a northern clock springs forward, 23:30 + 24h is 00:30
  // *two* days later, so "tomorrow" would skip a day entirely.
  //
  // The zone is stubbed rather than assumed: the suite pins no TZ, so a
  // test that depended on the machine's own would prove something
  // different on a CI runner than it does locally.
  it('lands on tomorrow across a spring-forward boundary', () => {
    vi.stubEnv('TZ', 'America/New_York')
    // 2026-03-08 is the US spring-forward date.
    expect(scheduleDate(new Date(2026, 2, 7, 23, 30), 1)).toBe('2026-03-08')
  })

  // The same failure in the other direction: on a 25-hour day the naive
  // version lands back on the day it started.
  it('lands on tomorrow across a fall-back boundary', () => {
    vi.stubEnv('TZ', 'America/New_York')
    expect(scheduleDate(new Date(2026, 10, 1, 0, 30), 1)).toBe('2026-11-02')
  })
})

describe('scheduledDue', () => {
  const now = new Date(2026, 7, 11, 14, 30)

  it('gives an undated todo an all-day due', () => {
    expect(scheduledDue(undefined, now, 0)).toEqual({
      kind: 'date',
      value: '2026-08-11',
    })
  })

  it('keeps an all-day todo all-day', () => {
    const due = { kind: 'date', value: '2026-01-02' } as const
    expect(scheduledDue(due, now, 1)).toEqual({
      kind: 'date',
      value: '2026-08-12',
    })
  })

  // The point of the helper: moving the date must not silently discard the
  // time the row is displaying.
  it('carries an existing time over to the new date', () => {
    const due = {
      kind: 'zoned',
      tzid: 'Australia/Brisbane',
      value: '2026-01-02T09:15:00',
    } as const
    expect(scheduledDue(due, now, 0)).toMatchObject({
      kind: 'zoned',
      value: '2026-08-11T09:15:00',
    })
  })

  // The timed actions — "Tomorrow 9am", "Today 5pm". Passing a time is the
  // caller saying the time *is* the point, so it overwrites rather than
  // preserving (docs/specs/todos.md — row actions).
  it('sets the given time on an undated todo', () => {
    expect(scheduledDue(undefined, now, 1, '09:00')).toMatchObject({
      kind: 'zoned',
      value: '2026-08-12T09:00:00',
    })
  })

  it('overwrites an existing time when one is given', () => {
    const due = {
      kind: 'zoned',
      tzid: 'Australia/Brisbane',
      value: '2026-01-02T09:15:00',
    } as const
    expect(scheduledDue(due, now, 0, '17:00')).toMatchObject({
      value: '2026-08-11T17:00:00',
    })
  })

  it('gives an all-day todo a time when one is given', () => {
    const due = { kind: 'date', value: '2026-01-02' } as const
    expect(scheduledDue(due, now, 0, '17:00')).toMatchObject({
      kind: 'zoned',
      value: '2026-08-11T17:00:00',
    })
  })

  it('carries the time from a floating due as wall-clock text', () => {
    const due = { kind: 'floating', value: '2026-01-02T17:45:00' } as const
    expect(scheduledDue(due, now, 1)).toMatchObject({
      value: '2026-08-12T17:45:00',
    })
  })
})

// docs/specs/todos.md — row actions: "Today 5pm" must not schedule into
// the past, so the item is disabled once the time has gone.
describe('timeHasPassed', () => {
  it('is false before the time', () => {
    expect(timeHasPassed('17:00', new Date(2026, 7, 11, 16, 59))).toBe(false)
  })

  it('is true at the time', () => {
    // Exactly on the hour counts as passed: a todo due "now" is due, not
    // upcoming, and offering it would put a deadline on the current minute.
    expect(timeHasPassed('17:00', new Date(2026, 7, 11, 17, 0))).toBe(true)
  })

  it('is true after the time', () => {
    expect(timeHasPassed('17:00', new Date(2026, 7, 11, 21, 30))).toBe(true)
  })

  it('is false first thing in the morning', () => {
    expect(timeHasPassed('09:00', new Date(2026, 7, 11, 0, 1))).toBe(false)
  })
})

// docs/specs/todos.md — row actions: an option that would write back the
// value the todo already has is disabled, rather than costing a round-trip
// and reading as a button that does nothing.
describe('scheduleIsNoop', () => {
  const now = new Date(2026, 7, 11, 10, 0)

  it('is false for an undated todo — everything is a change', () => {
    expect(scheduleIsNoop(undefined, now, 0)).toBe(false)
  })

  it('is true for "Today" on an all-day todo already due today', () => {
    const due = { kind: 'date', value: '2026-08-11' } as const
    expect(scheduleIsNoop(due, now, 0)).toBe(true)
  })

  it('is false for "Today" on a todo due tomorrow', () => {
    const due = { kind: 'date', value: '2026-08-12' } as const
    expect(scheduleIsNoop(due, now, 0)).toBe(false)
  })

  // The plain actions keep the time, so a timed todo already on that day
  // is equally a no-op.
  it('is true for "Today" on a timed todo already due today', () => {
    const due = {
      kind: 'zoned',
      tzid: viewerTimeZone(),
      value: '2026-08-11T09:00:00',
    } as const
    expect(scheduleIsNoop(due, now, 0)).toBe(true)
  })

  // But a *timed* action on the same todo is a real change, which is why
  // this compares the whole `TodoDue` rather than just the date.
  it('is false for "Today 5pm" on a todo due today at 9am', () => {
    const due = {
      kind: 'zoned',
      tzid: viewerTimeZone(),
      value: '2026-08-11T09:00:00',
    } as const
    expect(scheduleIsNoop(due, now, 0, '17:00')).toBe(false)
  })

  it('is false when only the zone differs', () => {
    const due = {
      kind: 'zoned',
      tzid: 'Pacific/Kiritimati',
      value: '2026-08-11T09:00:00',
    } as const
    expect(scheduleIsNoop(due, now, 0)).toBe(false)
  })
})

// docs/specs/todos.md — quick scheduling, the weekend actions.
describe('daysUntilWeekday', () => {
  // 2026-08-17 is a Monday, so the week can be walked from a known point.
  const monday = new Date(2026, 7, 17, 10, 0)

  it('counts forward to the coming Saturday and Sunday', () => {
    expect(daysUntilWeekday(monday, SATURDAY)).toBe(5)
    expect(daysUntilWeekday(monday, SUNDAY)).toBe(6)
  })

  // The decision that shapes the menu: on the day itself, "This Saturday"
  // means today rather than the one a week out. An item naming the day you
  // are looking at should not jump a week.
  it('returns 0 on the day itself', () => {
    const saturday = new Date(2026, 7, 22, 10, 0)
    expect(daysUntilWeekday(saturday, SATURDAY)).toBe(0)
    const sunday = new Date(2026, 7, 23, 10, 0)
    expect(daysUntilWeekday(sunday, SUNDAY)).toBe(0)
  })

  // Sunday is 0 in `Date#getDay`, so a naive subtraction goes negative
  // everywhere past midweek. The modulo is what keeps it forward-only.
  it('wraps rather than going negative', () => {
    const saturday = new Date(2026, 7, 22, 10, 0)
    expect(daysUntilWeekday(saturday, SUNDAY)).toBe(1)
    const friday = new Date(2026, 7, 21, 10, 0)
    expect(daysUntilWeekday(friday, SUNDAY)).toBe(2)
  })

  it('never returns more than a week out', () => {
    for (let day = 0; day < 7; day += 1) {
      const at = new Date(2026, 7, 17 + day, 10, 0)
      for (const weekday of [SATURDAY, SUNDAY]) {
        const offset = daysUntilWeekday(at, weekday)
        expect(offset).toBeGreaterThanOrEqual(0)
        expect(offset).toBeLessThanOrEqual(6)
      }
    }
  })

  it('lands on a date that really is that weekday', () => {
    const date = scheduleDate(monday, daysUntilWeekday(monday, SATURDAY))
    expect(date).toBe('2026-08-22')
    expect(new Date(2026, 7, 22).getDay()).toBe(SATURDAY)
  })
})
