import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CaldavError } from '../../src/caldav/errors'
import type { CaldavGateway } from '../../src/caldav/gateway'
import { makeTsdavGateway } from '../../src/caldav/tsdav-gateway'
import { startRadicale, type RadicaleHandle } from './helpers/radicale'

let radicale: RadicaleHandle
let gateway: CaldavGateway

beforeAll(async () => {
  radicale = await startRadicale()
  gateway = makeTsdavGateway({
    serverUrl: `${radicale.url}/test-user/`,
    username: 'test-user',
    password: 'anything',
  })
  await gateway.login()
})

afterAll(() => radicale?.stop())

describe('tsdav gateway against radicale', () => {
  it('creates, discovers, renames and deletes lists', async () => {
    const created = await gateway.createList('chores', 'Chores')
    expect(created.displayName).toBe('Chores')

    let lists = await gateway.fetchLists()
    expect(lists.map((list) => list.id)).toContain('chores')

    await gateway.renameList('chores', 'House chores')
    lists = await gateway.fetchLists()
    expect(lists.find((list) => list.id === 'chores')?.displayName).toBe(
      'House chores',
    )

    await gateway.deleteList('chores')
    lists = await gateway.fetchLists()
    expect(lists.map((list) => list.id)).not.toContain('chores')
  })

  it('full todo CRUD with etag concurrency', async () => {
    await gateway.createList('work', 'Work')
    const created = await gateway.createTodo('work', {
      uid: 'todo-1',
      summary: 'Write report',
      priority: 'high',
      due: { kind: 'date', value: '2026-08-15' },
    })
    expect(created.etag).not.toBe('')
    expect(created.summary).toBe('Write report')

    const fetched = await gateway.fetchTodos('work')
    expect(fetched?.todos).toHaveLength(1)

    // ctag short-circuit: an unchanged collection returns null
    expect(await gateway.fetchTodos('work', fetched?.ctag ?? '')).toBeNull()

    const updated = await gateway.updateTodo('work', 'todo-1', created.etag, {
      completed: true,
    })
    expect(updated.completed).toBe(true)
    expect(updated.etag).not.toBe(created.etag)

    // stale etag → 412
    await expect(
      gateway.updateTodo('work', 'todo-1', created.etag, { summary: 'x' }),
    ).rejects.toThrowError(CaldavError)

    await gateway.deleteTodo('work', 'todo-1', updated.etag)
    expect((await gateway.fetchTodos('work'))?.todos).toHaveLength(0)
  })

  // docs/specs/lists.md — colours and ordering round-trip through Apple's
  // calendar-color / calendar-order. Radicale supports both; this is the
  // proof, and it is an integration test because it is entirely about
  // what the server actually stores and returns.
  it('round-trips a list colour and order', async () => {
    await gateway.createList('painted', 'Painted')

    await gateway.setListProps('painted', { color: '#1D9BF6', order: 5 })

    let lists = await gateway.fetchLists()
    let painted = lists.find((list) => list.id === 'painted')
    expect(painted?.color).toBe('#1D9BF6')
    expect(painted?.order).toBe(5)

    // Changing one must not disturb the other.
    await gateway.setListProps('painted', { order: 2 })
    lists = await gateway.fetchLists()
    painted = lists.find((list) => list.id === 'painted')
    expect(painted?.color).toBe('#1D9BF6')
    expect(painted?.order).toBe(2)

    // Renaming must not disturb either — the guarantee that Fold never
    // rewrites what it did not set.
    await gateway.renameList('painted', 'Repainted')
    lists = await gateway.fetchLists()
    painted = lists.find((list) => list.id === 'painted')
    expect(painted?.displayName).toBe('Repainted')
    expect(painted?.color).toBe('#1D9BF6')
    expect(painted?.order).toBe(2)

    await gateway.deleteList('painted')
  })

  it('creates a list with a colour and an order already set', async () => {
    await gateway.createList('born-blue', 'Born blue', {
      color: '#2FA84F',
      order: 9,
    })
    const lists = await gateway.fetchLists()
    const born = lists.find((list) => list.id === 'born-blue')
    expect(born?.color).toBe('#2FA84F')
    expect(born?.order).toBe(9)
    await gateway.deleteList('born-blue')
  })

  it('discovers a list that has neither colour nor order', async () => {
    await gateway.createList('plain', 'Plain')
    const lists = await gateway.fetchLists()
    const plain = lists.find((list) => list.id === 'plain')
    expect(plain?.color).toBeUndefined()
    expect(plain?.order).toBeUndefined()
    await gateway.deleteList('plain')
  })

  // Task 4 replaced tsdav's default PROPFIND props with an explicit
  // LIST_PROPS list, because passing `props` *replaces* the defaults
  // rather than extending them. That list is invisible to unit tests: if
  // someone later trims it, `cs:getctag` vanishes, `ctag` falls back to
  // '' in toList, the short-circuit in fetchTodos stops firing (it
  // guards on `ctag !== ''`), and the app silently gets slower with every
  // test still green. This is the assertion that would catch it.
  it('still reads the properties tsdav would have asked for by default', async () => {
    await gateway.createList('props-check', 'Props check')
    const lists = await gateway.fetchLists()
    const list = lists.find((entry) => entry.id === 'props-check')

    // ctag drives the cheap-refetch short-circuit.
    expect(list?.ctag).not.toBe('')
    // displayname must survive too — losing it would fall back to the id.
    expect(list?.displayName).toBe('Props check')

    await gateway.deleteList('props-check')
  })

  // docs/specs/lists.md — clearing. `null` removes the property rather
  // than writing an empty value, so the list reads as "no colour" exactly
  // like one that never had one. Colour and order are separate D:remove
  // entries, so both are exercised: first one alone (proving a clear of
  // one leaves the other standing), then the other.
  it('clears a colour and an order when asked to', async () => {
    await gateway.createList('temporary', 'Temporary', {
      color: '#A8564A',
      order: 4,
    })

    await gateway.setListProps('temporary', { color: null })
    let lists = await gateway.fetchLists()
    let list = lists.find((entry) => entry.id === 'temporary')
    expect(list?.color).toBeUndefined()
    expect(list?.order).toBe(4)

    await gateway.setListProps('temporary', { order: null })
    lists = await gateway.fetchLists()
    list = lists.find((entry) => entry.id === 'temporary')
    expect(list?.order).toBeUndefined()

    await gateway.deleteList('temporary')
  })

  it('preserves foreign properties through an edit round-trip', async () => {
    await gateway.createList('foreign', 'Foreign')
    const foreignIcs = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Another Client//EN',
      'BEGIN:VTODO',
      'UID:foreign-todo',
      'DTSTAMP:20260701T120000Z',
      'SUMMARY:From another client',
      'X-OTHER-CLIENT-PROP:precious',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'TRIGGER:-PT10M',
      'DESCRIPTION:reminder',
      'END:VALARM',
      'END:VTODO',
      'END:VCALENDAR',
    ].join('\r\n')

    // PUT it the way a foreign client would (raw, odd filename).
    const put = await fetch(
      `${radicale.url}/test-user/foreign/some-odd-name.ics`,
      {
        method: 'PUT',
        headers: {
          authorization: `Basic ${Buffer.from('test-user:x').toString(
            'base64',
          )}`,
          'content-type': 'text/calendar; charset=utf-8',
        },
        body: foreignIcs,
      },
    )
    expect(put.ok).toBe(true)

    const todos = (await gateway.fetchTodos('foreign'))?.todos ?? []
    const todo = todos.find((entry) => entry.uid === 'foreign-todo')
    expect(todo).toBeDefined()
    if (!todo) return

    await gateway.updateTodo('foreign', todo.uid, todo.etag, {
      summary: 'Edited by us',
    })

    const raw = await fetch(todo.href, {
      headers: {
        authorization: `Basic ${Buffer.from('test-user:x').toString('base64')}`,
      },
    }).then((response) => response.text())

    expect(raw).toContain('SUMMARY:Edited by us')
    expect(raw).toContain('X-OTHER-CLIENT-PROP:precious')
    expect(raw).toContain('BEGIN:VALARM')
  })
})
