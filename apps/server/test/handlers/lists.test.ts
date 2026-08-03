import type { TodoList } from '@fold/schemas'
import { describe, expect, it, vi } from 'vitest'
import { createRouter } from '../../src/api/router'
import { routes } from '../../src/api/routes'
import { sessionCookie } from '../../src/session/cookie'
import { testApp, TEST_SECRET } from '../helpers/test-app'

const CREDS = {
  serverUrl: 'http://localhost:5232',
  username: 'jack',
  password: 'hunter2',
}

const authed = async (path: string, init?: RequestInit): Promise<Request> => {
  const cookie = (await sessionCookie(CREDS, TEST_SECRET, false)).split(';')[0]
  const headers = new Headers(init?.headers)
  headers.set('cookie', cookie ?? '')
  return new Request(`http://x${path}`, { ...init, headers })
}

const LIST: TodoList = {
  id: 'chores',
  href: '/jack/chores/',
  displayName: 'Chores',
  ctag: 'ct-1',
}

describe('lists handlers', () => {
  it('401s without a session', async () => {
    const handle = createRouter(routes, testApp())
    const res = await handle(new Request('http://x/api/lists'))
    expect(res.status).toBe(401)
  })

  it('GET /api/lists returns discovered lists', async () => {
    const fetchLists = vi.fn().mockResolvedValue([LIST])
    const handle = createRouter(routes, testApp({ fetchLists }))
    const res = await handle(await authed('/api/lists'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([LIST])
  })

  it('POST /api/lists creates and returns the list', async () => {
    const createList = vi.fn().mockResolvedValue(LIST)
    const handle = createRouter(routes, testApp({ createList }))
    const res = await handle(
      await authed('/api/lists', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'chores', displayName: 'Chores' }),
      }),
    )
    expect(res.status).toBe(201)
    expect(createList).toHaveBeenCalledWith('chores', 'Chores')
  })

  it('POST /api/lists carries colour and order to the gateway', async () => {
    const createList = vi.fn().mockResolvedValue(LIST)
    const handle = createRouter(routes, testApp({ createList }))
    const res = await handle(
      await authed('/api/lists', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'chores',
          displayName: 'Chores',
          color: '#FF8800',
          order: 3,
        }),
      }),
    )
    expect(res.status).toBe(201)
    expect(createList).toHaveBeenCalledWith('chores', 'Chores', {
      color: '#FF8800',
      order: 3,
    })
  })

  it('PATCH renames, DELETE removes', async () => {
    const renameList = vi.fn().mockResolvedValue(undefined)
    const setListProps = vi.fn().mockResolvedValue(undefined)
    const deleteList = vi.fn().mockResolvedValue(undefined)
    const handle = createRouter(
      routes,
      testApp({ renameList, setListProps, deleteList }),
    )

    const patch = await handle(
      await authed('/api/lists/chores', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: 'House chores' }),
      }),
    )
    expect(patch.status).toBe(204)
    expect(renameList).toHaveBeenCalledWith('chores', 'House chores')
    expect(setListProps).not.toHaveBeenCalled()

    const del = await handle(
      await authed('/api/lists/chores', { method: 'DELETE' }),
    )
    expect(del.status).toBe(204)
    expect(deleteList).toHaveBeenCalledWith('chores')
  })

  it('PATCH with only a colour sets props without renaming', async () => {
    const renameList = vi.fn().mockResolvedValue(undefined)
    const setListProps = vi.fn().mockResolvedValue(undefined)
    const handle = createRouter(routes, testApp({ renameList, setListProps }))

    const res = await handle(
      await authed('/api/lists/chores', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ color: '#3B82F6' }),
      }),
    )
    expect(res.status).toBe(204)
    expect(setListProps).toHaveBeenCalledWith('chores', { color: '#3B82F6' })
    expect(renameList).not.toHaveBeenCalled()
  })

  it('PATCH with only an order sets just the order', async () => {
    const renameList = vi.fn().mockResolvedValue(undefined)
    const setListProps = vi.fn().mockResolvedValue(undefined)
    const handle = createRouter(routes, testApp({ renameList, setListProps }))

    const res = await handle(
      await authed('/api/lists/chores', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ order: 4 }),
      }),
    )
    expect(res.status).toBe(204)
    expect(setListProps).toHaveBeenCalledWith('chores', { order: 4 })
    expect(renameList).not.toHaveBeenCalled()
  })

  it('PATCH with a name and a colour does both in one request', async () => {
    const renameList = vi.fn().mockResolvedValue(undefined)
    const setListProps = vi.fn().mockResolvedValue(undefined)
    const handle = createRouter(routes, testApp({ renameList, setListProps }))

    const res = await handle(
      await authed('/api/lists/chores', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          displayName: 'House chores',
          color: '#3B82F6',
          order: 2,
        }),
      }),
    )
    expect(res.status).toBe(204)
    expect(renameList).toHaveBeenCalledWith('chores', 'House chores')
    expect(setListProps).toHaveBeenCalledWith('chores', {
      color: '#3B82F6',
      order: 2,
    })
  })

  it('PATCH clearing a colour reaches the gateway as null', async () => {
    const setListProps = vi.fn().mockResolvedValue(undefined)
    const handle = createRouter(routes, testApp({ setListProps }))

    const res = await handle(
      await authed('/api/lists/chores', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ color: null }),
      }),
    )
    expect(res.status).toBe(204)
    expect(setListProps).toHaveBeenCalledWith('chores', { color: null })
  })
})
