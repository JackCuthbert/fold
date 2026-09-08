import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { run } from '../src/run'
import { createSessionStore } from '../src/session-store'

describe('login recovery', () => {
  it.each(['{', '{}'])(
    'replaces an invalid session file: %s',
    async (value) => {
      const directory = await mkdtemp(join(tmpdir(), 'fold-cli-login-'))
      const path = join(directory, 'session.json')
      const store = createSessionStore(path)
      try {
        await writeFile(path, value)
        const fetcher = vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            Response.json(
              { serverUrl: 'https://dav.example', username: 'jack' },
              { headers: { 'set-cookie': 'session=new; Max-Age=604800' } },
            ),
          )
        const exitCode = await run(['auth', 'login'], {
          store,
          fetcher,
          env: {
            FOLD_CALDAV_URL: 'https://dav.example',
            FOLD_USERNAME: 'jack',
            FOLD_PASSWORD: 'secret',
          },
          prompter: {
            text: async () => 'https://fold.example',
            password: async () => '',
            confirm: async () => false,
          },
          stdout: { write: () => true },
          stderr: { write: () => true },
        })

        expect(exitCode).toBe(0)
        expect(await store.load()).toMatchObject({
          foldUrl: 'https://fold.example',
          cookie: 'session=new',
        })
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    },
  )

  it('reports session filesystem errors before attempting login', async () => {
    let stderr = ''
    const fetcher = vi.fn<typeof fetch>()
    const exitCode = await run(['auth', 'login'], {
      store: {
        load: async () => {
          throw new Error('Permission denied')
        },
        save: async () => {},
        clear: async () => {},
      },
      fetcher,
      stderr: { write: (value) => ((stderr += String(value)), true) },
    })

    expect(exitCode).toBe(1)
    expect(stderr).toContain('Permission denied')
    expect(fetcher).not.toHaveBeenCalled()
  })
})
