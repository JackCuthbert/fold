import type { Todo } from '@fold/schemas'
import { describe, expect, it } from 'vitest'
import {
  addLocalDays,
  DERIVED_VIEWS,
  groupByDueDay,
  isNext7DaysView,
  isTodayView,
  isTomorrowView,
  NEXT_7_DAYS_VIEW,
  selectNextWeek,
  selectToday,
  selectTomorrow,
  sortByDueInstant,
  SUMMARY_VIEW,
  TODAY_VIEW,
  TOMORROW_VIEW,
} from './today'

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
    //
    // Asserted as the *relative* order of the three day views rather than
    // as the whole array. What matters is that they read forwards then
    // back — the day you are in, the day next, then what is behind you —
    // and a literal list said that while also silently claiming no view
    // may ever be added. It broke the moment Search was appended, exactly
    // as its own literal-count predecessors did in the help modal and the
    // shortcut map. *(changed 2026-08-06, issue #6.)*
    const order = [TODAY_VIEW, TOMORROW_VIEW, SUMMARY_VIEW].map((view) =>
      DERIVED_VIEWS.indexOf(view),
    )
    expect(order).not.toContain(-1)
    expect(order).toEqual([...order].toSorted((a, b) => a - b))
  })

  it('keeps Today first, since it is the default view', () => {
    // Selection falls back here whenever a persisted list id no longer
    // resolves (main-screen.tsx), and it takes Ctrl+Shift+1.
    expect(DERIVED_VIEWS[0]).toBe(TODAY_VIEW)
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

// docs/specs/next-7-days-view.md
describe('NEXT_7_DAYS_VIEW sentinel', () => {
  it('cannot collide with a real list id', () => {
    // Same reasoning as the two above: 'next-7-days' is an unlikely
    // collection name but a perfectly legal one, and the prefix is what
    // makes the sentinel impossible to produce rather than merely unlikely.
    expect(NEXT_7_DAYS_VIEW).not.toBe('next-7-days')
    expect(NEXT_7_DAYS_VIEW).toContain(':')
    expect(isNext7DaysView('next-7-days')).toBe(false)
    expect(isNext7DaysView(NEXT_7_DAYS_VIEW)).toBe(true)
    expect(isNext7DaysView(null)).toBe(false)
  })

  it('sits after Tomorrow and before Summary, so its chord is the third', () => {
    // The relative order rather than a literal array, for the reason the
    // Tomorrow case above gives: a literal also claims no view may ever be
    // added, and has broken every time one was.
    const order = [TOMORROW_VIEW, NEXT_7_DAYS_VIEW, SUMMARY_VIEW].map((view) =>
      DERIVED_VIEWS.indexOf(view),
    )
    expect(order).not.toContain(-1)
    expect(order).toEqual([...order].toSorted((a, b) => a - b))
  })
})

describe('selectNextWeek', () => {
  it('includes work due later today, which is day one of the window', () => {
    // The whole overlap decision in one assertion: the window starts today,
    // not tomorrow, because "next 7 days" that skips today is really
    // "days 3-7" (docs/specs/next-7-days-view.md — the window).
    const items = [
      todo('this-afternoon', {
        due: { kind: 'floating', value: '2026-08-10T17:00:00' },
      }),
      todo('tomorrow', { due: { kind: 'date', value: '2026-08-11' } }),
    ]
    expect(selectNextWeek(items, NOW).map((t) => t.uid)).toEqual([
      'this-afternoon',
      'tomorrow',
    ])
  })

  it('reaches the seventh day and stops', () => {
    // Today counts as the first of the seven, so the last day in is
    // today+6 — 16 August from a 10 August NOW — and 17 August is out.
    const items = [
      todo('day-six', { due: { kind: 'date', value: '2026-08-16' } }),
      todo('day-seven', { due: { kind: 'date', value: '2026-08-17' } }),
    ]
    expect(selectNextWeek(items, NOW).map((t) => t.uid)).toEqual(['day-six'])
  })

  it('never shows overdue work — that is still Today’s job', () => {
    // Bounded below exactly as Tomorrow is. A view of the week ahead that
    // carried everything already missed would answer a different question
    // than the one it is named for.
    const items = [
      todo('yesterday', { due: { kind: 'date', value: '2026-08-09' } }),
      todo('last-year', { due: { kind: 'date', value: '2025-01-01' } }),
    ]
    expect(selectNextWeek(items, NOW)).toEqual([])
  })

  it('excludes todos with no due date', () => {
    expect(selectNextWeek([todo('someday')], NOW)).toEqual([])
  })

  it('shows outstanding work only', () => {
    // Forward-looking views carry no completed section: a finished todo
    // belongs to the day it was *done*, which Today shows and Summary
    // files (docs/specs/next-7-days-view.md).
    const items = [
      todo('done-early', {
        completed: true,
        completedAt: '2026-08-10T12:30:00.000Z',
        due: { kind: 'date', value: '2026-08-13' },
      }),
      todo('still-to-do', { due: { kind: 'date', value: '2026-08-13' } }),
    ]
    expect(selectNextWeek(items, NOW).map((t) => t.uid)).toEqual([
      'still-to-do',
    ])
  })

  it('contains everything Today and Tomorrow show, except the overdue', () => {
    // The relationship the spec argues for: this is the *span* those two
    // sit inside, not a third adjacent slice. Overlapping them is the
    // point — it is the same work seen at a wider zoom — and the one thing
    // it does not inherit is Today's open lower bound.
    const items = [
      todo('overdue', { due: { kind: 'date', value: '2026-08-01' } }),
      todo('today', { due: { kind: 'date', value: '2026-08-10' } }),
      todo('tomorrow', { due: { kind: 'date', value: '2026-08-11' } }),
      todo('midweek', { due: { kind: 'date', value: '2026-08-14' } }),
      todo('beyond', { due: { kind: 'date', value: '2026-08-20' } }),
    ]
    const week = selectNextWeek(items, NOW).map((t) => t.uid)
    expect(week).toEqual(['today', 'tomorrow', 'midweek'])

    // Everything Tomorrow shows is here.
    for (const item of selectTomorrow(items, NOW)) {
      expect(week).toContain(item.uid)
    }
    // And everything Today shows that is not overdue.
    for (const item of selectToday(items, NOW)) {
      if (item.uid !== 'overdue') expect(week).toContain(item.uid)
    }
    expect(week).not.toContain('overdue')
  })

  it('rolls across a month boundary', () => {
    // Calendar arithmetic, not +7×86_400_000: from 29 August the window
    // has to reach 4 September.
    const items = [
      todo('september', { due: { kind: 'date', value: '2026-09-04' } }),
      todo('too-far', { due: { kind: 'date', value: '2026-09-05' } }),
    ]
    const lateAugust = new Date('2026-08-29T12:00:00')
    expect(selectNextWeek(items, lateAugust).map((t) => t.uid)).toEqual([
      'september',
    ])
  })

  it('holds the same seven days from midnight to late evening', () => {
    // The window is days, not a rolling 168 hours from `now`. A rolling
    // one would quietly drop the seventh day's morning work by dinnertime.
    const items = [
      todo('day-six', { due: { kind: 'date', value: '2026-08-16' } }),
    ]
    expect(selectNextWeek(items, new Date('2026-08-10T00:05:00'))).toHaveLength(
      1,
    )
    expect(selectNextWeek(items, new Date('2026-08-10T23:55:00'))).toHaveLength(
      1,
    )
  })
})

// docs/specs/next-7-days-view.md — grouped by day.
describe('groupByDueDay', () => {
  it('buckets by the local day a todo is due, soonest day first', () => {
    const items = [
      todo('thursday', { due: { kind: 'date', value: '2026-08-13' } }),
      todo('today-a', { due: { kind: 'date', value: '2026-08-10' } }),
      todo('tomorrow', { due: { kind: 'date', value: '2026-08-11' } }),
      todo('today-b', {
        due: { kind: 'floating', value: '2026-08-10T09:00:00' },
      }),
    ]
    expect(
      groupByDueDay(items).map((day) => [day.day, day.todos.map((t) => t.uid)]),
    ).toEqual([
      ['2026-08-10', ['today-a', 'today-b']],
      ['2026-08-11', ['tomorrow']],
      ['2026-08-13', ['thursday']],
    ])
  })

  // The bug this guards against is a real one: copying Summary's
  // comparator would reverse the days and silently put next Thursday above
  // tomorrow, which reads as correct until you notice the dates descend.
  it('runs forwards, the opposite of Summary', () => {
    const items = [
      todo('later', { due: { kind: 'date', value: '2026-08-16' } }),
      todo('sooner', { due: { kind: 'date', value: '2026-08-11' } }),
    ]
    const days = groupByDueDay(items).map((day) => day.day)
    expect(days).toEqual([...days].toSorted())
    expect(days[0]).toBe('2026-08-11')
  })

  it('preserves the incoming order within a day', () => {
    // The caller sorts by due instant before grouping, so a day's rows must
    // come out in the order they went in rather than being re-sorted here.
    const due = { kind: 'floating' as const, value: '2026-08-11T09:00:00' }
    const items = [todo('a', { due }), todo('b', { due }), todo('c', { due })]
    expect(groupByDueDay(items)[0]?.todos.map((t) => t.uid)).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  it('yields no day for a date nothing is due on', () => {
    // Empty days are omitted rather than drawn as an empty heading
    // (docs/specs/next-7-days-view.md — empty days). Nothing is due on the
    // 12th, so there is no bucket for it at all.
    const items = [
      todo('eleventh', { due: { kind: 'date', value: '2026-08-11' } }),
      todo('thirteenth', { due: { kind: 'date', value: '2026-08-13' } }),
    ]
    expect(groupByDueDay(items).map((day) => day.day)).toEqual([
      '2026-08-11',
      '2026-08-13',
    ])
  })

  it('drops undated todos rather than bucketing them at infinity', () => {
    expect(groupByDueDay([todo('someday')])).toEqual([])
  })

  it('buckets an evening todo on its own local day, not the UTC one', () => {
    // `toISOString` would put a 9pm-Melbourne todo on the following day —
    // the same trap `localDayOf` exists to avoid, and the reason this
    // shares that function with Summary rather than formatting its own.
    const items = [
      todo('tonight', {
        due: { kind: 'floating', value: '2026-08-10T21:00:00' },
      }),
    ]
    expect(groupByDueDay(items)[0]?.day).toBe('2026-08-10')
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
