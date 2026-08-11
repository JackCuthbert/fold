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
      // Falls back to `now` when the input carries no CREATED of its own.
      created: NOW.toISOString(),
    })
  })

  // The ordering fix (docs/specs/todos.md — ordering) depends on the
  // client's own CREATED surviving the round-trip untouched: if the codec
  // substituted its own stamp, the optimistic placeholder and the stored
  // copy would sort differently and a new todo would jump.
  it('preserves a caller-supplied created stamp', () => {
    const created = '2026-01-02T03:04:05.000Z'
    const ics = createTodoIcs({ uid: 'c1', summary: 's', created }, NOW)
    expect(readTodo(ics)?.created).toBe(created)
    expect(ics).toContain('CREATED:20260102T030405Z')
  })

  it('is deterministic for a fixed now', () => {
    const a = createTodoIcs({ uid: 'x', summary: 'a' }, NOW)
    const b = createTodoIcs({ uid: 'x', summary: 'a' }, NOW)
    expect(a).toBe(b)
    expect(a).toContain('DTSTAMP:20260730T100000Z')
  })

  // Reading our own output back is not enough — it would accept malformed
  // parameters that other clients reject. Assert the wire format directly.
  it.each([
    [{ kind: 'date', value: '2026-08-10' }, 'DUE;VALUE=DATE:20260810'],
    [
      { kind: 'utc', value: '2026-08-10T09:00:00.000Z' },
      'DUE:20260810T090000Z',
    ],
    [{ kind: 'floating', value: '2026-08-10T09:00:00' }, 'DUE:20260810T090000'],
    [
      {
        kind: 'zoned',
        tzid: 'Australia/Brisbane',
        value: '2026-08-10T09:00:00',
      },
      'DUE;TZID=Australia/Brisbane:20260810T090000',
    ],
  ] as const)('writes %o as a well-formed %s', (due, expected) => {
    const ics = createTodoIcs({ uid: 'w', summary: 's', due }, NOW)
    const line = ics.split('\r\n').find((l) => l.startsWith('DUE'))
    expect(line).toBe(expected)
  })

  // RFC 5545 §3.7.3. Nothing reads PRODID, so these guard the two ways it
  // can go wrong without anything else noticing: naming a project that no
  // longer exists, and reporting a version that stopped tracking releases.
  describe('PRODID', () => {
    const prodid = (): string =>
      createTodoIcs({ uid: 'p', summary: 's' }, NOW)
        .split('\r\n')
        .find((line) => line.startsWith('PRODID:')) ?? ''

    it('names the project as it is actually published', () => {
      // `caldav-todo-client` was the pre-rename name, and the repository at
      // that name 404s — a reader of the .ics could find nothing.
      expect(prodid()).toContain('Fold')
      expect(prodid()).not.toContain('caldav-todo-client')
    })

    it('carries the released version, not this package.json being stale', () => {
      // The value is only useful for "did some past release mangle this?",
      // which needs a version that moves. packages/vtodo/package.json is
      // bumped by release-please (release-please-config.json extra-files);
      // if it is ever dropped from that list this pins at 0.1.0 and the
      // label silently lies forever.
      expect(prodid()).toMatch(
        /^PRODID:-\/\/JackCuthbert\/\/Fold \d+\.\d+\.\d+\/\/EN$/,
      )
    })
  })
})
