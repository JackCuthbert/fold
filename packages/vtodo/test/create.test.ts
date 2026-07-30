import { describe, expect, it } from 'vitest'
import { createTodoIcs } from '../src/create'
import { readTodo } from '../src/read'

const NOW = new Date('2026-07-30T10:00:00Z')

describe('createTodoIcs', () => {
  it('creates an ics that reads back with the same data', () => {
    const ics = createTodoIcs(
      {
        uid: 'new-1',
        summary: 'Water plants',
        due: { kind: 'date', value: '2026-08-01' },
        priority: 'high',
        description: 'The ferns too',
      },
      NOW,
    )
    expect(readTodo(ics)).toEqual({
      uid: 'new-1',
      summary: 'Water plants',
      completed: false,
      due: { kind: 'date', value: '2026-08-01' },
      priority: 'high',
      description: 'The ferns too',
    })
  })

  it('is deterministic for a fixed now', () => {
    const a = createTodoIcs({ uid: 'x', summary: 'a' }, NOW)
    const b = createTodoIcs({ uid: 'x', summary: 'a' }, NOW)
    expect(a).toBe(b)
    expect(a).toContain('DTSTAMP:20260730T100000Z')
  })
})
