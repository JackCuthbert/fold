import { describe, expect, it } from 'vitest'
import { CaldavError } from '../src/caldav/errors'
import { toTodo } from '../src/caldav/tsdav-gateway'

const ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Test//EN',
  'BEGIN:VTODO',
  'UID:todo-1',
  'DTSTAMP:20260701T120000Z',
  'SUMMARY:Buy milk',
  'END:VTODO',
  'END:VCALENDAR',
].join('\r\n')

describe('toTodo', () => {
  it('maps a well-formed object with an etag', () => {
    const todo = toTodo('chores', {
      url: '/chores/todo-1.ics',
      etag: '"abc123"',
      data: ICS,
    })
    expect(todo).toMatchObject({ uid: 'todo-1', etag: '"abc123"' })
  })

  it('returns null and warns for a malformed VTODO', () => {
    const todo = toTodo('chores', {
      url: '/chores/broken.ics',
      etag: '"abc123"',
      data: 'not an ics file',
    })
    expect(todo).toBeNull()
  })

  // A server that omits ETags can't safely be used for concurrent
  // editing: our whole conflict story (update/delete's If-Match
  // pre-check) depends on them. Radicale always sends ETags, so the
  // integration suite can't exercise this path — pinned here instead.
  // See docs/specs/caldav-compliance.md.
  it('throws rather than defaulting a missing etag to empty string', () => {
    expect(() =>
      toTodo('chores', {
        url: '/chores/todo-1.ics',
        data: ICS,
      }),
    ).toThrowError(CaldavError)
  })
})
