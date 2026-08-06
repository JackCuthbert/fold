import { describe, expect, it } from 'vitest'
import { dueToFields, fieldsToDue } from './due-fields'

// docs/specs/todos.md — due times.
describe('dueToFields', () => {
  it('leaves the time empty for an all-day todo', () => {
    // The ordering rule resolves an all-day date to 23:59:59 local; reading
    // the *form* rather than the resolved instant is what stops the time
    // field showing "23:59" for every all-day todo.
    expect(dueToFields({ kind: 'date', value: '2026-08-10' })).toEqual({
      date: '2026-08-10',
      time: '',
    })
  })

  it('reads a zoned wall clock verbatim, without applying a host offset', () => {
    expect(
      dueToFields({
        kind: 'zoned',
        tzid: 'Australia/Brisbane',
        value: '2026-08-10T09:00:00',
      }),
    ).toEqual({ date: '2026-08-10', time: '09:00' })
  })

  it('reads a floating wall clock verbatim too', () => {
    expect(
      dueToFields({ kind: 'floating', value: '2026-08-10T09:00:00' }),
    ).toEqual({ date: '2026-08-10', time: '09:00' })
  })

  it('is empty when there is no due date', () => {
    expect(dueToFields(undefined)).toEqual({ date: '', time: '' })
  })
})

describe('fieldsToDue', () => {
  it('writes an all-day date when no time is given', () => {
    expect(fieldsToDue({ date: '2026-08-10', time: '' })).toEqual({
      kind: 'date',
      value: '2026-08-10',
    })
  })

  it('writes a zoned due in the viewer zone when a time is given', () => {
    expect(
      fieldsToDue({ date: '2026-08-10', time: '09:00' }, 'Australia/Brisbane'),
    ).toEqual({
      kind: 'zoned',
      tzid: 'Australia/Brisbane',
      value: '2026-08-10T09:00:00',
    })
  })

  it('clears the due date when both fields are empty', () => {
    expect(fieldsToDue({ date: '', time: '' })).toBeNull()
  })

  it('rejects a time with no date rather than dropping the time', () => {
    // DUE cannot express a time without a date. Returning undefined lets
    // the form show an error instead of silently discarding what was typed.
    expect(fieldsToDue({ date: '', time: '09:00' })).toBeUndefined()
  })

  it('round-trips a zoned value back through dueToFields unchanged', () => {
    const fields = { date: '2026-08-10', time: '09:00' }
    const due = fieldsToDue(fields, 'Australia/Brisbane')
    expect(due).not.toBeNull()
    expect(due).toBeDefined()
    expect(dueToFields(due ?? undefined)).toEqual(fields)
  })
})

// The rule the detail form relies on to preserve a foreign client's DUE:
// "did the user change it?" must be answered from the *form fields*, never
// by rebuilding a TodoDue and comparing. This test pins down why.
describe('preserving a foreign DUE form', () => {
  it('renders floating and zoned identically, so only fields can be compared', () => {
    // Both forms produce the same two inputs. A rebuilt due is therefore
    // always `zoned`, and comparing it to a stored *floating* value would
    // report a change the user never made — rewriting the foreign client's
    // DUE on an unrelated edit (docs/specs/caldav-compliance.md).
    const floating = dueToFields({
      kind: 'floating',
      value: '2026-08-15T14:30:00',
    })
    const zoned = dueToFields({
      kind: 'zoned',
      tzid: 'Australia/Melbourne',
      value: '2026-08-15T14:30:00',
    })
    expect(floating).toEqual(zoned)

    // Round-tripping an untouched floating value does NOT reproduce it...
    const rebuilt = fieldsToDue(floating, 'Australia/Melbourne')
    expect(rebuilt).not.toEqual({
      kind: 'floating',
      value: '2026-08-15T14:30:00',
    })
    // ...so equality of the fields themselves is the only safe signal.
    expect(dueToFields(rebuilt ?? undefined)).toEqual(floating)
  })
})
