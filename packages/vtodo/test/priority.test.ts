import { describe, expect, it } from 'vitest'
import { priorityFromNumber, priorityToNumber } from '../src/priority'

describe('priorityFromNumber', () => {
  it.each([
    [1, 'high'],
    [4, 'high'],
    [5, 'medium'],
    [6, 'low'],
    [9, 'low'],
  ])('maps %i to %s', (num, label) => {
    expect(priorityFromNumber(num)).toBe(label)
  })

  it.each([[0], [10], [-1], [2.5], ['5'], [undefined], [null]])(
    'maps %o to undefined',
    (num) => {
      expect(priorityFromNumber(num)).toBeUndefined()
    },
  )
})

describe('priorityToNumber', () => {
  it('round-trips through priorityFromNumber', () => {
    for (const label of ['high', 'medium', 'low'] as const) {
      expect(priorityFromNumber(priorityToNumber(label))).toBe(label)
    }
  })
})
