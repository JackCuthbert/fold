import type { Todo } from '@fold/schemas'
import { describe, expect, it } from 'vitest'
import { punctualityOf } from '../src/todos/punctuality'

const todo = (extra: Partial<Todo>): Todo => ({
  uid: 'u',
  listId: 'l',
  href: '/u',
  etag: 'e',
  summary: 'u',
  completed: true,
  ...extra,
})

// Local wall-clock throughout, so these read the same in any timezone.
const at = (...parts: [number, number, number, number?, number?]): string =>
  new Date(
    parts[0],
    parts[1],
    parts[2],
    parts[3] ?? 0,
    parts[4] ?? 0,
  ).toISOString()

// docs/specs/todos.md — metadata: on time or late, derived from COMPLETED
// against DUE.
describe('punctualityOf', () => {
  it('reports nothing without both a due date and a completion stamp', () => {
    expect(punctualityOf(todo({ completedAt: at(2026, 7, 3, 9) }))).toBeNull()
    expect(
      punctualityOf(todo({ due: { kind: 'date', value: '2026-08-03' } })),
    ).toBeNull()
    expect(punctualityOf(todo({}))).toBeNull()
  })

  it('ignores a malformed completion stamp', () => {
    expect(
      punctualityOf(
        todo({
          due: { kind: 'date', value: '2026-08-03' },
          completedAt: 'not-a-date',
        }),
      ),
    ).toBeNull()
  })

  describe('all-day todos are judged by the day, not the instant', () => {
    const due = { kind: 'date' as const, value: '2026-08-03' }

    it('counts any time on the due date as on time', () => {
      // The trap: dueInstant resolves an all-day date to 23:59:59, so a
      // literal comparison would call a 3pm finish "9 hours early".
      for (const hour of [0, 9, 15, 23]) {
        const result = punctualityOf(
          todo({ due, completedAt: at(2026, 7, 3, hour) }),
        )
        expect(result?.kind).toBe('onTime')
        expect(result?.label).toBe('Completed on time')
      }
    })

    it('counts the next day as late, in whole days', () => {
      const result = punctualityOf(
        todo({ due, completedAt: at(2026, 7, 4, 9) }),
      )
      expect(result?.kind).toBe('late')
      expect(result?.label).toBe('Completed 1 day late')
    })

    it('counts an earlier day as early, in whole days', () => {
      const result = punctualityOf(
        todo({ due, completedAt: at(2026, 7, 1, 9) }),
      )
      expect(result?.kind).toBe('early')
      expect(result?.label).toContain('early')
    })
  })

  describe('timed todos compare instants', () => {
    const due = { kind: 'floating' as const, value: '2026-08-03T09:00:00' }

    it('treats a near-miss either way as on time', () => {
      // 09:01 for a 09:00 deadline was not late in any sense that matters.
      expect(
        punctualityOf(todo({ due, completedAt: at(2026, 7, 3, 9, 1) }))?.kind,
      ).toBe('onTime')
      expect(
        punctualityOf(todo({ due, completedAt: at(2026, 7, 3, 8, 59) }))?.kind,
      ).toBe('onTime')
    })

    it('reports hours early', () => {
      const result = punctualityOf(
        todo({ due, completedAt: at(2026, 7, 3, 7) }),
      )
      expect(result?.kind).toBe('early')
      expect(result?.label).toBe('Completed 2 hours early')
    })

    it('reports hours late', () => {
      const result = punctualityOf(
        todo({ due, completedAt: at(2026, 7, 3, 12) }),
      )
      expect(result?.kind).toBe('late')
      expect(result?.label).toBe('Completed 3 hours late')
    })

    it('reports minutes for a small gap, singular where apt', () => {
      const result = punctualityOf(
        todo({ due, completedAt: at(2026, 7, 3, 9, 30) }),
      )
      expect(result?.label).toBe('Completed 30 minutes late')
    })

    it('rolls up to days for a large gap', () => {
      const result = punctualityOf(
        todo({ due, completedAt: at(2026, 7, 5, 9) }),
      )
      expect(result?.label).toBe('Completed 2 days late')
    })
  })
})
