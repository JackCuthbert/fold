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
