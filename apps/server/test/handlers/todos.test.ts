import type { Todo } from '@fold/schemas'
import { describe, expect, it, vi } from 'vitest'
import { CaldavError } from '../../src/caldav/errors'
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

const TODO: Todo = {
  uid: 't-1',
  listId: 'chores',
  href: '/jack/chores/t-1.ics',
  etag: 'et-2',
  summary: 'Buy milk',
  completed: false,
}

describe('todos handlers', () => {
  it('GET returns todos with the collection ctag', async () => {
    const fetchTodos = vi
      .fn()
      .mockResolvedValue({ ctag: 'ct-1', todos: [TODO] })
    const handle = createRouter(routes, testApp({ fetchTodos }))
    const res = await handle(await authed('/api/lists/chores/todos'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ctag: 'ct-1', todos: [TODO] })
    expect(fetchTodos).toHaveBeenCalledWith('chores')
  })

  it('GET responds 304 when the client ctag is current', async () => {
    const fetchTodos = vi.fn().mockResolvedValue(null)
    const handle = createRouter(routes, testApp({ fetchTodos }))
    const res = await handle(
      await authed('/api/lists/chores/todos', {
        headers: { 'if-none-match': 'ct-1' },
      }),
    )
    expect(res.status).toBe(304)
    expect(fetchTodos).toHaveBeenCalledWith('chores', 'ct-1')
  })

  it('POST creates and returns the todo with its etag', async () => {
    const createTodo = vi.fn().mockResolvedValue(TODO)
    const handle = createRouter(routes, testApp({ createTodo }))
    const res = await handle(
      await authed('/api/lists/chores/todos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ uid: 't-1', summary: 'Buy milk' }),
      }),
    )
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual(TODO)
  })

  it('PUT applies changes and returns the fresh todo', async () => {
    const updateTodo = vi.fn().mockResolvedValue(TODO)
    const handle = createRouter(routes, testApp({ updateTodo }))
    const res = await handle(
      await authed('/api/lists/chores/todos/t-1', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ etag: 'et-1', changes: { completed: true } }),
      }),
    )
    expect(res.status).toBe(200)
    expect(updateTodo).toHaveBeenCalledWith('chores', 't-1', 'et-1', {
      completed: true,
    })
  })

  it('PUT conflict responds 412 WITH the fresh server copy', async () => {
    const updateTodo = vi.fn().mockRejectedValue(new CaldavError(412))
    const fetchTodo = vi.fn().mockResolvedValue(TODO)
    const handle = createRouter(routes, testApp({ updateTodo, fetchTodo }))
    const res = await handle(
      await authed('/api/lists/chores/todos/t-1', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ etag: 'stale', changes: { summary: 'x' } }),
      }),
    )
    expect(res.status).toBe(412)
    expect(await res.json()).toEqual({ todo: TODO })
  })

  it('DELETE passes the etag and 204s', async () => {
    const deleteTodo = vi.fn().mockResolvedValue(undefined)
    const handle = createRouter(routes, testApp({ deleteTodo }))
    const res = await handle(
      await authed('/api/lists/chores/todos/t-1', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ etag: 'et-2' }),
      }),
    )
    expect(res.status).toBe(204)
    expect(deleteTodo).toHaveBeenCalledWith('chores', 't-1', 'et-2')
  })

  it('DELETE conflict also responds 412 with the fresh copy', async () => {
    const deleteTodo = vi.fn().mockRejectedValue(new CaldavError(412))
    const fetchTodo = vi.fn().mockResolvedValue(TODO)
    const handle = createRouter(routes, testApp({ deleteTodo, fetchTodo }))
    const res = await handle(
      await authed('/api/lists/chores/todos/t-1', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ etag: 'stale' }),
      }),
    )
    expect(res.status).toBe(412)
    expect(await res.json()).toEqual({ todo: TODO })
  })
})
