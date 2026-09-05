import type { Todo } from '@fold/schemas'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Prompter } from '../src/prompt'
import { run } from '../src/run'
import type { SessionStore, StoredSession } from '../src/session-store'

const LIST = {
  id: 'personal',
  href: '/dav/personal/',
  displayName: 'Personal',
  ctag: 'ctag-1',
}

const TODO: Todo = {
  uid: 'todo-1',
  listId: LIST.id,
  href: '/dav/personal/todo-1.ics',
  etag: 'etag-1',
  summary: 'Buy milk',
  completed: false,
}

describe('Fold CLI', () => {
  let saved: StoredSession | null
  let store: SessionStore
  let stdout: string
  let stderr: string

  beforeEach(() => {
    saved = null
    stdout = ''
    stderr = ''
    store = {
      load: async () => saved,
      save: async (session) => {
        saved = session
      },
      clear: async () => {
        saved = null
      },
    }
  })

  it('logs in once and stores the sealed session cookie', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      json({ serverUrl: 'https://dav.example/user/', username: 'jack' }, 200, {
        'set-cookie':
          'session=sealed; HttpOnly; Secure; SameSite=Strict; Max-Age=604800',
      }),
    )

    expect(
      await invoke(
        [
          'auth',
          'login',
          '--fold-url',
          'https://fold.example',
          '--server-url',
          'https://dav.example/user/',
          '--username',
          'jack',
        ],
        { fetcher, env: { FOLD_PASSWORD: 'secret' } },
      ),
    ).toBe(0)
    expect(stderr).toBe('')
    expect(saved).toEqual({
      foldUrl: 'https://fold.example',
      cookie: 'session=sealed',
      expiresAt: expect.any(Number),
    })
    expect(await requestBody(fetcher)).toEqual({
      serverUrl: 'https://dav.example/user/',
      username: 'jack',
      password: 'secret',
    })
  })

  it('creates a todo in a named list and emits JSON', async () => {
    signedIn()
    const created = { ...TODO, uid: 'created-1' }
    const fetcher = routeFetch([
      json([LIST]),
      json(created, 201, {
        'set-cookie': 'session=renewed; HttpOnly; Max-Age=604800',
      }),
    ])

    expect(
      await invoke(
        ['todo', 'create', 'Buy milk', '--list', 'Personal', '--json'],
        { fetcher },
      ),
    ).toBe(0)
    expect(JSON.parse(stdout)).toMatchObject({ todo: created })
    expect(saved?.cookie).toBe('session=renewed')
    expect(fetcher.mock.calls[1]?.[1]?.body).toContain('"summary":"Buy milk"')
  })

  it('lists todos with their list and stable identity', async () => {
    signedIn()
    const completed = { ...TODO, uid: 'done-1', completed: true }
    const fetcher = routeFetch([
      json([LIST]),
      json({ ctag: 'ctag-1', todos: [TODO, completed] }),
    ])

    expect(await invoke(['todo', 'list', '--json'], { fetcher })).toBe(0)
    expect(JSON.parse(stdout)).toMatchObject({
      todos: [{ list: LIST, todo: TODO }],
    })
  })

  it('includes completed todos only when requested', async () => {
    signedIn()
    const completed = { ...TODO, uid: 'done-1', completed: true }
    const fetcher = routeFetch([
      json([LIST]),
      json({ ctag: 'ctag-1', todos: [TODO, completed] }),
    ])

    expect(
      await invoke(['todo', 'list', '--include-completed', '--json'], {
        fetcher,
      }),
    ).toBe(0)
    expect(JSON.parse(stdout).todos).toHaveLength(2)
  })

  it('views every field of one todo in human output', async () => {
    signedIn()
    const detailed = {
      ...TODO,
      description: 'Call before arrival',
      priority: 'high' as const,
      due: { kind: 'date' as const, value: '2026-09-05' },
      created: '2026-09-04T00:00:00.000Z',
    }
    const fetcher = routeFetch([
      json([LIST]),
      json({ ctag: 'ctag-1', todos: [detailed] }),
    ])

    expect(await invoke(['todo', 'view', TODO.uid], { fetcher })).toBe(0)
    expect(stdout).toContain('Summary: Buy milk')
    expect(stdout).toContain('Description: Call before arrival')
    expect(stdout).toContain(
      'Due: {\\"kind\\":\\"date\\",\\"value\\":\\"2026-09-05\\"}',
    )
    expect(stdout).toContain('UID: todo-1')
    expect(stdout).toContain('ETag: etag-1')
  })

  it('escapes untrusted terminal control characters in human output', async () => {
    signedIn()
    const fetcher = routeFetch([
      json([{ ...LIST, displayName: 'Personal\nforged' }]),
      json({ ctag: 'ctag-1', todos: [{ ...TODO, summary: 'Milk\u001b[2J' }] }),
    ])

    expect(await invoke(['todo', 'list'], { fetcher })).toBe(0)
    expect(stdout).toContain('Personal\\nforged')
    expect(stdout).toContain('Milk\\u001b[2J')
    expect(stdout).not.toContain('\u001b')
  })

  it('edits and completes a todo using its current ETag', async () => {
    signedIn()
    const edited = { ...TODO, etag: 'etag-2', summary: 'Buy oat milk' }
    const completed = { ...edited, etag: 'etag-3', completed: true }
    const fetcher = routeFetch([
      json([LIST]),
      json({ ctag: 'ctag-1', todos: [TODO] }),
      json(edited),
      json([LIST]),
      json({ ctag: 'ctag-2', todos: [edited] }),
      json(completed),
    ])

    expect(
      await invoke(['todo', 'edit', TODO.uid, '--summary', edited.summary], {
        fetcher,
      }),
    ).toBe(0)
    expect(fetcher.mock.calls[2]?.[1]?.body).toBe(
      JSON.stringify({ etag: TODO.etag, changes: { summary: edited.summary } }),
    )

    expect(await invoke(['todo', 'complete', TODO.uid], { fetcher })).toBe(0)
    expect(fetcher.mock.calls[5]?.[1]?.body).toBe(
      JSON.stringify({ etag: edited.etag, changes: { completed: true } }),
    )
  })

  it('requires confirmation before deleting, then uses the current ETag', async () => {
    signedIn()
    const fetcher = routeFetch([
      json([LIST]),
      json({ ctag: 'ctag-1', todos: [TODO] }),
      new Response(null, { status: 204 }),
    ])
    const prompter: Prompter = {
      text: async () => '',
      password: async () => '',
      confirm: async () => true,
    }

    expect(
      await invoke(['todo', 'delete', TODO.uid], { fetcher, prompter }),
    ).toBe(0)
    expect(fetcher.mock.calls[2]?.[1]?.body).toBe(
      JSON.stringify({ etag: TODO.etag }),
    )
  })

  const signedIn = (): void => {
    saved = {
      foldUrl: 'https://fold.example',
      cookie: 'session=sealed',
      expiresAt: Date.now() + 60_000,
    }
  }

  const invoke = (
    args: string[],
    dependencies: {
      fetcher?: typeof fetch
      prompter?: Prompter
      env?: NodeJS.ProcessEnv
    },
  ) =>
    run(args, {
      ...dependencies,
      store,
      stdout: { write: (value) => ((stdout += String(value)), true) },
      stderr: { write: (value) => ((stderr += String(value)), true) },
    })
})

const routeFetch = (responses: Response[]) =>
  vi.fn<typeof fetch>(async () => {
    const response = responses.shift()
    if (!response) throw new Error('unexpected request')
    return response
  })

const json = (
  body: unknown,
  status = 200,
  headers?: Record<string, string>,
): Response => Response.json(body, { status, ...(headers ? { headers } : {}) })

const requestBody = async (fetcher: ReturnType<typeof vi.fn<typeof fetch>>) => {
  const body = fetcher.mock.calls[0]?.[1]?.body
  if (typeof body !== 'string') throw new Error('request had no JSON body')
  return JSON.parse(body) as unknown
}
