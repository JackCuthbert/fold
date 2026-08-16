import { describe, expect, it } from 'vitest'
import { formatListColor, parseListColor } from '../src/list-color'

// docs/specs/lists.md — colours: Apple writes 8-digit #RRGGBBAA; we store
// 6. Anything we can't read is treated as absent, never as an error — a
// foreign client writing garbage must not break list discovery.
describe('parseListColor', () => {
  it('drops the alpha suffix Apple writes', () => {
    expect(parseListColor('#1D9BF6FF')).toBe('#1D9BF6')
  })

  it('accepts a plain 6-digit colour unchanged', () => {
    expect(parseListColor('#1D9BF6')).toBe('#1D9BF6')
  })

  it('uppercases, so equal colours compare equal', () => {
    expect(parseListColor('#1d9bf6')).toBe('#1D9BF6')
  })

  it('expands the 3-digit shorthand', () => {
    expect(parseListColor('#ABC')).toBe('#AABBCC')
  })

  it('tolerates surrounding whitespace', () => {
    expect(parseListColor('  #1D9BF6FF \n')).toBe('#1D9BF6')
  })

  it('treats anything unreadable as absent', () => {
    for (const bad of ['', 'red', '#12', '#GGGGGG', '#1D9BF6FFF', 'nonsense']) {
      expect(parseListColor(bad)).toBeNull()
    }
  })

  it('treats a non-string as absent', () => {
    expect(parseListColor(undefined)).toBeNull()
    expect(parseListColor(null)).toBeNull()
    expect(parseListColor(42)).toBeNull()
  })
})

describe('formatListColor', () => {
  it('writes the 8-digit form other clients expect', () => {
    expect(formatListColor('#1D9BF6')).toBe('#1D9BF6FF')
  })

  it('round-trips a value read from the server', () => {
    const stored = '#E8503AFF'
    const parsed = parseListColor(stored)
    expect(parsed).not.toBeNull()
    expect(formatListColor(parsed!)).toBe(stored)
  })
})
