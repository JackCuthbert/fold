import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readTodo } from '../src/read'

const fixture = (name: string): string =>
  readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8')

describe('readTodo', () => {
  it('reads a minimal todo as incomplete', () => {
    const todo = readTodo(fixture('simple.ics'))
    expect(todo).toMatchObject({
      uid: 'simple-1',
      summary: 'Buy milk',
      completed: false,
    })
    expect(todo?.due).toBeUndefined()
    expect(todo?.priority).toBeUndefined()
  })

  it('reads status, date-only due, priority, folded description', () => {
    const todo = readTodo(fixture('full.ics'))
    expect(todo).toMatchObject({
      uid: 'full-1',
      completed: true,
      due: { kind: 'date', value: '2026-07-10' },
      priority: 'medium',
    })
    expect(todo?.description).toContain('folded across multiple physical')
  })

  it('returns null when there is no VTODO', () => {
    expect(readTodo(fixture('event-only.ics'))).toBeNull()
  })

  it('returns null for unparseable input', () => {
    expect(readTodo('not an ics file')).toBeNull()
  })
})
