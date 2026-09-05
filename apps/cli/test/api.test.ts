import { describe, expect, it, vi } from 'vitest'
import { FoldApi } from '../src/api'
import { ApiError, CliError } from '../src/errors'
import type { SessionStore, StoredSession } from '../src/session-store'

const SESSION: StoredSession = {
  foldUrl: 'https://fold.example',
  cookie: 'session=sealed',
  expiresAt: 2_000,
}

describe('Fold API client', () => {
  it('requires a saved session before making a request', async () => {
    const { store } = memoryStore(null)

    await expect(FoldApi.authenticated(store)).rejects.toMatchObject({
      message: 'Not signed in; run fold auth login',
      exitCode: 3,
    })
  })

  it('rejects login responses without a persistent session cookie', async () => {
    const { store } = memoryStore(null)
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ username: 'jack', serverUrl: 'dav' }))

    await expect(
      FoldApi.login(
        SESSION.foldUrl,
        { serverUrl: 'https://dav.example', username: 'jack', password: 'x' },
        store,
        fetcher,
      ),
    ).rejects.toThrow('Fold did not return a valid session cookie')
  })

  it('sends the saved cookie and persists a renewed cookie', async () => {
    const { store, saved } = memoryStore(SESSION)
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      json({ username: 'jack', serverUrl: 'https://dav.example' }, 200, {
        'set-cookie': 'session=renewed; Max-Age=3600; HttpOnly',
      }),
    )
    const api = await FoldApi.authenticated(store, fetcher)

    await expect(api.status()).resolves.toMatchObject({ username: 'jack' })
    expect(fetcher).toHaveBeenCalledWith(
      'https://fold.example/api/session',
      expect.objectContaining({ headers: { cookie: 'session=sealed' } }),
    )
    expect(saved()).toMatchObject({ cookie: 'session=renewed' })
  })

  it('clears a rejected session and reports that login is required', async () => {
    const { store, saved } = memoryStore(SESSION)
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ message: 'unauthorized' }, 401))
    const api = await FoldApi.authenticated(store, fetcher)

    await expect(api.lists()).rejects.toMatchObject({
      message: 'Session expired; run fold auth login',
      exitCode: 3,
    })
    expect(saved()).toBeNull()
  })

  it('distinguishes network failures from invalid JSON responses', async () => {
    const { store } = memoryStore(SESSION)
    const offline = vi.fn<typeof fetch>().mockRejectedValue(new Error('down'))
    const offlineApi = await FoldApi.authenticated(store, offline)

    await expect(offlineApi.lists()).rejects.toMatchObject({
      message: 'Could not reach Fold',
      exitCode: 1,
    })

    const invalid = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('not json'))
    const invalidApi = await FoldApi.authenticated(store, invalid)
    await expect(invalidApi.lists()).rejects.toThrow(
      'Fold returned an invalid JSON response',
    )
  })

  it('extracts only valid todo conflicts', async () => {
    const { store } = memoryStore(SESSION)
    const api = await FoldApi.authenticated(store)
    const todo = {
      uid: 'todo-1',
      listId: 'personal',
      href: '/todo-1.ics',
      etag: 'etag-2',
      summary: 'Changed',
      completed: false,
    }

    expect(api.conflict(new ApiError(412, { todo }))).toEqual(todo)
    expect(api.conflict(new ApiError(412, { todo: null }))).toBeNull()
    expect(api.conflict(new CliError('other'))).toBeNull()
  })
})

const memoryStore = (initial: StoredSession | null) => {
  let session = initial
  const store: SessionStore = {
    load: async () => session,
    save: async (value) => {
      session = value
    },
    clear: async () => {
      session = null
    },
  }
  return { store, saved: () => session }
}

const json = (
  body: unknown,
  status = 200,
  headers?: Record<string, string>,
): Response => Response.json(body, { status, ...(headers ? { headers } : {}) })
