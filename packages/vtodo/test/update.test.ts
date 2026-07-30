import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readTodo } from '../src/read'
import { applyChanges } from '../src/update'

const NOW = new Date('2026-07-30T10:00:00Z')
const fixture = (name: string): string =>
  readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8')

describe('applyChanges', () => {
  it('changes the summary and stamps the edit', () => {
    const out = applyChanges(
      fixture('simple.ics'),
      { summary: 'Buy oat milk' },
      NOW,
    )
    expect(readTodo(out)?.summary).toBe('Buy oat milk')
    expect(out).toContain('LAST-MODIFIED:20260730T100000Z')
    expect(out).toContain('SEQUENCE:1')
  })

  it('increments an existing SEQUENCE', () => {
    const once = applyChanges(fixture('simple.ics'), { summary: 'a' }, NOW)
    const twice = applyChanges(once, { summary: 'b' }, NOW)
    expect(twice).toContain('SEQUENCE:2')
  })

  it('completing writes STATUS, PERCENT-COMPLETE and COMPLETED', () => {
    const out = applyChanges(fixture('simple.ics'), { completed: true }, NOW)
    expect(readTodo(out)?.completed).toBe(true)
    expect(out).toContain('PERCENT-COMPLETE:100')
    expect(out).toContain('COMPLETED:20260730T100000Z')
  })

  it('un-completing removes COMPLETED and PERCENT-COMPLETE', () => {
    const out = applyChanges(fixture('full.ics'), { completed: false }, NOW)
    expect(readTodo(out)?.completed).toBe(false)
    expect(out).not.toContain('PERCENT-COMPLETE')
    expect(out).not.toContain('COMPLETED:')
  })

  it('null clears due, description and priority', () => {
    const out = applyChanges(
      fixture('full.ics'),
      { due: null, description: null, priority: null },
      NOW,
    )
    const todo = readTodo(out)
    expect(todo?.due).toBeUndefined()
    expect(todo?.description).toBeUndefined()
    expect(todo?.priority).toBeUndefined()
  })

  it('sets a date-time due', () => {
    const out = applyChanges(
      fixture('simple.ics'),
      { due: { kind: 'date-time', value: '2026-08-01T09:30:00.000Z' } },
      NOW,
    )
    expect(readTodo(out)?.due).toEqual({
      kind: 'date-time',
      value: '2026-08-01T09:30:00.000Z',
    })
  })

  it('throws VtodoError when there is no VTODO', () => {
    expect(() =>
      applyChanges(fixture('event-only.ics'), { summary: 'x' }, NOW),
    ).toThrowError('no VTODO component')
  })
})
