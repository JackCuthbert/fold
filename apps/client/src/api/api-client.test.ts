import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApi } from './client'
import { ApiError, NetworkError } from './errors'

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

afterEach(() => vi.unstubAllGlobals())

describe('api client', () => {
  it('parses valid responses through zod', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse([{ id: 'a', href: '/u/a/', displayName: 'A', ctag: '1' }]),
      )
    vi.stubGlobal('fetch', fetchMock)
    const api = createApi()
    expect(await api.getLists()).toEqual([
      { id: 'a', href: '/u/a/', displayName: 'A', ctag: '1' },
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/lists',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('rejects malformed response bodies', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse([{ nope: true }])),
    )
    await expect(createApi().getLists()).rejects.toThrow()
  })

  it('throws ApiError with status and parsed body on HTTP errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: 'conflict', message: 'stale' }, 412),
        ),
    )
    const error = await createApi()
      .patchList('a', { displayName: 'B' })
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    if (error instanceof ApiError) {
      expect(error.status).toBe(412)
      expect(error.body).toMatchObject({ error: 'conflict' })
    }
  })

  it('throws NetworkError when fetch itself rejects (offline)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('failed to fetch')),
    )
    await expect(createApi().getLists()).rejects.toBeInstanceOf(NetworkError)
  })

  it('getTodos returns null on 304 (ctag unchanged)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 304 })),
    )
    expect(await createApi().getTodos('l1', 'ct-1')).toBeNull()
  })

  it('getSession returns null on 401 instead of throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: 'unauthorized', message: 'no' }, 401),
        ),
    )
    expect(await createApi().getSession()).toBeNull()
  })
})
