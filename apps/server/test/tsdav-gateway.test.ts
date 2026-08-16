import { describe, expect, it, vi } from 'vitest'
import { CaldavError } from '../src/caldav/errors'
import { makeFetchWithRetry, toList, toTodo } from '../src/caldav/tsdav-gateway'

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

// docs/specs/lists.md — colours and ordering are read from an Apple
// extension, so a collection may carry neither and a foreign client may
// have written something we can't read. Neither case may break discovery.
describe('toList', () => {
  const base = { url: 'https://dav.example/cal/work/', ctag: 'c1' }

  it('reads the 8-digit colour Apple writes', () => {
    const list = toList({ ...base, calendarColor: '#1D9BF6FF' })
    expect(list.color).toBe('#1D9BF6')
  })

  it('reads an order returned as a number', () => {
    // Radicale returns a JS number here — verified live 2026-08-03.
    const list = toList({
      ...base,
      projectedProps: { calendarOrder: 7 },
    })
    expect(list.order).toBe(7)
  })

  it('reads an order returned as a string', () => {
    // Another server may serialize it as text; XML has no number type.
    const list = toList({
      ...base,
      projectedProps: { calendarOrder: '7' },
    })
    expect(list.order).toBe(7)
  })

  it('omits both when the collection has neither', () => {
    const list = toList(base)
    expect(list.color).toBeUndefined()
    expect(list.order).toBeUndefined()
  })

  it('treats an unreadable colour as absent rather than failing', () => {
    const list = toList({ ...base, calendarColor: 'chartreuse' })
    expect(list.color).toBeUndefined()
  })

  it('treats an unreadable order as absent rather than failing', () => {
    const list = toList({
      ...base,
      projectedProps: { calendarOrder: 'seventh' },
    })
    expect(list.order).toBeUndefined()
  })
})

const socketError = (): Error =>
  new Error(
    'The socket connection was closed unexpectedly. For more ' +
      'information, pass `verbose: true` in the second argument to fetch()',
  )

// Regression for the reproducible ~1-in-4 502 burst against a healthy
// Radicale: Bun's fetch drops an idle/reused connection under concurrent
// load and throws "The socket connection was closed unexpectedly" from
// inside tsdav's internal requests (login, fetchCalendars, REPORT, ...).
// Confirmed by instrumenting the gateway's error handling and firing
// concurrent bursts at a real Radicale — every failure was this exact,
// connection-level error, never a genuine server error. See
// tsdav-gateway.ts's `makeFetchWithRetry` for the full account.
describe('makeFetchWithRetry', () => {
  it('retries a transient socket error on an idempotent method', async () => {
    const baseFetch = vi
      .fn()
      .mockRejectedValueOnce(socketError())
      .mockResolvedValueOnce(new Response('ok'))
    const fetchWithRetry = makeFetchWithRetry(baseFetch)

    const response = await fetchWithRetry('http://x/', { method: 'PROPFIND' })
    expect(await response.text()).toBe('ok')
    expect(baseFetch).toHaveBeenCalledTimes(2)
  })

  it('gives up after exhausting attempts, surfacing the real error', async () => {
    const baseFetch = vi.fn().mockRejectedValue(socketError())
    const fetchWithRetry = makeFetchWithRetry(baseFetch)

    // A genuinely unreachable server must still fail — retrying can't
    // paper over an outage, only a spurious connection-level blip.
    await expect(
      fetchWithRetry('http://x/', { method: 'GET' }),
    ).rejects.toThrow('socket connection was closed unexpectedly')
    expect(baseFetch).toHaveBeenCalledTimes(3)
  })

  it('does not retry a mutating method, even on the same transient error', async () => {
    const baseFetch = vi.fn().mockRejectedValueOnce(socketError())
    const fetchWithRetry = makeFetchWithRetry(baseFetch)

    // PUT (createTodo) carries `If-None-Match: *`; update/delete carry an
    // etag precondition. Retrying blindly risks turning a reset that
    // happened *after* the write landed into a spurious 412 instead of
    // the write genuinely failing — not worth it for a rare edge case.
    await expect(
      fetchWithRetry('http://x/', { method: 'PUT' }),
    ).rejects.toThrow('socket connection was closed unexpectedly')
    expect(baseFetch).toHaveBeenCalledTimes(1)
  })

  it('does not retry a different kind of error', async () => {
    const baseFetch = vi.fn().mockRejectedValue(new Error('DNS lookup failed'))
    const fetchWithRetry = makeFetchWithRetry(baseFetch)

    await expect(
      fetchWithRetry('http://x/', { method: 'GET' }),
    ).rejects.toThrow('DNS lookup failed')
    expect(baseFetch).toHaveBeenCalledTimes(1)
  })

  it('defaults to GET (idempotent) when no method is given', async () => {
    const baseFetch = vi
      .fn()
      .mockRejectedValueOnce(socketError())
      .mockResolvedValueOnce(new Response('ok'))
    const fetchWithRetry = makeFetchWithRetry(baseFetch)

    const response = await fetchWithRetry('http://x/')
    expect(await response.text()).toBe('ok')
    expect(baseFetch).toHaveBeenCalledTimes(2)
  })
})
