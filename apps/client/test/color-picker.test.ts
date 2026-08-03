import { describe, expect, it } from 'vitest'
import { commitValue } from '../src/lists/color-picker'

// docs/specs/lists.md — colours: typing into the hex field must not clear
// the colour on every keystroke while a value is half-typed. Three
// outcomes, not two — set, cleared, and "leave it alone".
describe('commitValue', () => {
  it('sets the colour from a complete hex', () => {
    expect(commitValue('#4A6F96')).toEqual({ kind: 'set', color: '#4A6F96' })
  })

  it('normalizes the case a native colour input emits', () => {
    // <input type="color"> always reports lowercase; we store uppercase.
    expect(commitValue('#4a6f96')).toEqual({ kind: 'set', color: '#4A6F96' })
  })

  it('accepts the alpha suffix another client may have written', () => {
    expect(commitValue('#1D9BF6FF')).toEqual({ kind: 'set', color: '#1D9BF6' })
  })

  it('expands shorthand a person might type', () => {
    expect(commitValue('#ABC')).toEqual({ kind: 'set', color: '#AABBCC' })
  })

  it('clears the colour when the field is emptied', () => {
    expect(commitValue('')).toEqual({ kind: 'cleared' })
    expect(commitValue('   ')).toEqual({ kind: 'cleared' })
  })

  // The reason the draft is held separately from the value at all: typing
  // "#4A6F96" passes through "#4", "#4A", "#4A6"... and none of those may
  // clear the colour that is already set.
  //
  // "#4A6" is the exception, and deliberately so: it is a *valid* 3-digit
  // shorthand, so it commits #44AA66 in passing before the full six digits
  // land. Harmless — the colour is only ever briefly wrong, never cleared —
  // and the alternative is rejecting shorthand that a person may well have
  // meant to type in full.
  it('leaves the colour alone while a hex is half-typed', () => {
    for (const partial of ['#', '#4', '#4A', '#4A6F', '#4A6F9']) {
      expect(commitValue(partial)).toEqual({ kind: 'incomplete' })
    }
  })

  it('treats three digits as the shorthand it is, mid-typing or not', () => {
    expect(commitValue('#4A6')).toEqual({ kind: 'set', color: '#44AA66' })
  })

  it('leaves the colour alone for input that is not a hex at all', () => {
    expect(commitValue('rebeccapurple')).toEqual({ kind: 'incomplete' })
    expect(commitValue('#GGHHII')).toEqual({ kind: 'incomplete' })
  })
})
