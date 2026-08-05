import { describe, expect, it } from 'vitest'
import {
  duplicateKindNames,
  featuresOf,
  kindExplanation,
  listKindOf,
  unlistedKinds,
} from '../src/lists/list-kind'

// docs/specs/list-kinds.md — matching.
describe('listKindOf', () => {
  it('matches a name whatever its case or surrounding space', () => {
    expect(listKindOf('Groceries')).toBe('GROCERY_LIST')
    expect(listKindOf('GrOcErIeS')).toBe('GROCERY_LIST')
    expect(listKindOf('  groceries  ')).toBe('GROCERY_LIST')
    expect(listKindOf('chores')).toBe('CHORES_LIST')
    expect(listKindOf('Chores')).toBe('CHORES_LIST')
  })

  it('recognises each kind by its documented names', () => {
    expect(listKindOf('shopping')).toBe('GROCERY_LIST')
    expect(listKindOf('To-Read')).toBe('MEDIA_LIST')
    expect(listKindOf('to watch')).toBe('MEDIA_LIST')
    expect(listKindOf('Wellbeing')).toBe('HEALTH_LIST')
  })

  it('recognises the everyday names people actually use', () => {
    for (const name of ['Supermarket', 'Market', 'Food shopping']) {
      expect(listKindOf(name)).toBe('GROCERY_LIST')
    }
    for (const name of ['Housework', 'Cleaning', 'Errands', 'Maintenance']) {
      expect(listKindOf(name)).toBe('CHORES_LIST')
    }
    for (const name of ['Books', 'Films', 'Podcasts', 'Someday', 'Backlog']) {
      expect(listKindOf(name)).toBe('MEDIA_LIST')
    }
    for (const name of ['Medical', 'Meds', 'Appointments', 'Dentist']) {
      expect(listKindOf(name)).toBe('HEALTH_LIST')
    }
  })

  // Health promotes its todos above everything else, unconditionally, so a
  // false positive there is louder than in any other kind. These names all
  // touch on health but describe lists that are as often a log or a wish
  // list as a set of things to do (docs/specs/list-kinds.md).
  it('keeps fitness-adjacent names out of the health kind', () => {
    for (const name of ['Fitness', 'Exercise', 'Gym', 'Self care', 'Running']) {
      expect(listKindOf(name)).toBeNull()
    }
  })

  // The rule that makes the feature predictable, and the one most likely
  // to be "improved" into substring matching by someone later.
  it('never matches on a substring', () => {
    expect(listKindOf('Weekend Shopping List')).toBeNull()
    expect(listKindOf('Stop shopping impulsively')).toBeNull()
    expect(listKindOf('Household chores and errands')).toBeNull()
    expect(listKindOf('groceries!')).toBeNull()
  })

  it('leaves an ordinary list unmarked', () => {
    expect(listKindOf('Work')).toBeNull()
    expect(listKindOf('')).toBeNull()
  })

  // "One kind per list" is a property of the name table, not of the
  // lookup — a name claimed twice would silently resolve to whichever
  // kind was registered last.
  it('claims no name for two kinds', () => {
    expect(duplicateKindNames()).toEqual([])
  })

  // LIST_KINDS is written out by hand so the lookup can stay type-safe
  // without an assertion, which means it can fall behind the definitions —
  // and a kind missing from it matches nothing, silently.
  it('lists every kind it defines', () => {
    expect(unlistedKinds()).toEqual([])
  })
})

describe('featuresOf', () => {
  it('gives a grocery list grouping and bulk complete, not scheduling', () => {
    expect(featuresOf('Groceries')).toEqual({
      groups: true,
      bulkComplete: true,
      bulkSchedule: false,
      noDueDates: false,
      health: false,
    })
  })

  it('gives a chores list both bulk actions, but no grouping', () => {
    // Chores are individually interesting in a day's summary in a way
    // grocery items are not, so they are not collapsed.
    expect(featuresOf('Chores')).toEqual({
      groups: false,
      bulkComplete: true,
      bulkSchedule: true,
      noDueDates: false,
      health: false,
    })
  })

  it('takes due dates off a media list, and nothing else', () => {
    expect(featuresOf('Reading')).toEqual({
      groups: false,
      bulkComplete: false,
      bulkSchedule: false,
      noDueDates: true,
      health: false,
    })
  })

  it('gives an ordinary list nothing', () => {
    expect(featuresOf('Work')).toEqual({
      groups: false,
      bulkComplete: false,
      bulkSchedule: false,
      noDueDates: false,
      health: false,
    })
  })

  // Every other kind keeps its due dates — only media lists lose them.
  it('leaves due dates alone on every other kind', () => {
    for (const name of ['Groceries', 'Chores', 'Health']) {
      expect(featuresOf(name).noDueDates).toBe(false)
    }
  })

  it('marks a health list, and gives it no bulk actions', () => {
    // Health todos are ordinary todos in their own list — the behaviour is
    // entirely about where they appear in the derived views.
    expect(featuresOf('Health')).toEqual({
      groups: false,
      bulkComplete: false,
      bulkSchedule: false,
      noDueDates: false,
      health: true,
    })
    expect(featuresOf('Wellbeing').health).toBe(true)
  })

  it('marks no other kind as health', () => {
    for (const name of ['Groceries', 'Chores', 'Reading', 'Work']) {
      expect(featuresOf(name).health).toBe(false)
    }
  })
})

describe('kindExplanation', () => {
  it('explains a recognised list, and says nothing about others', () => {
    expect(kindExplanation('Groceries')?.label).toBe('Grocery list')
    expect(kindExplanation('Groceries')?.description).toBeTruthy()
    expect(kindExplanation('Work')).toBeNull()
  })
})
