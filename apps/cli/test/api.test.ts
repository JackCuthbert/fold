import { describe, expect, it, vi } from 'vitest'
import { FoldApi } from '../src/api'
import { ApiError } from '../src/errors'
import type { SessionStore, StoredSession } from '../src/session-store'

const SESSION: StoredSession = {
  foldUrl: 'https://fold.example',
  cookie: 'session=sealed',
  expiresAt: 2_000,
}

describe('Fold API client', () => {
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

  it('rejects invalid JSON responses', async () => {
    const { store } = memoryStore(SESSION)
    const invalid = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('not json'))
    const invalidApi = await FoldApi.authenticated(store, invalid)
    await expect(invalidApi.lists()).rejects.toThrow(
      'Fold returned an invalid JSON response',
    )
  })

  it('clears the session when logout fails', async () => {
    const { store, saved } = memoryStore(SESSION)
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('offline'))
    const api = await FoldApi.authenticated(store, fetcher)

    await expect(api.logout()).rejects.toThrow()
    expect(saved()).toBeNull()
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      'https://fold.example/api/session',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('rejects a conflict with an invalid todo payload', async () => {
    const { store } = memoryStore(SESSION)
    const api = await FoldApi.authenticated(store)
    expect(api.conflict(new ApiError(412, { todo: null }))).toBeNull()
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
