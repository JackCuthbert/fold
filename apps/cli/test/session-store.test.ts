import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createSessionStore, sessionPath } from '../src/session-store'

describe('session store', () => {
  it('uses the platform state directory unless Fold overrides it', () => {
    expect(sessionPath({}, 'darwin', '/Users/jack')).toBe(
      '/Users/jack/Library/Application Support/Fold/session.json',
    )
    expect(sessionPath({}, 'linux', '/home/jack')).toBe(
      '/home/jack/.local/state/fold/session.json',
    )
    expect(
      sessionPath({ XDG_STATE_HOME: '/state' }, 'linux', '/home/jack'),
    ).toBe('/state/fold/session.json')
    expect(
      sessionPath({ FOLD_STATE_DIR: './fold-state' }, 'linux', '/home/jack'),
    ).toBe(join(process.cwd(), 'fold-state', 'session.json'))
  })

  it('round-trips a private session file and clears it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fold-cli-test-'))
    const path = join(directory, 'state', 'session.json')
    const store = createSessionStore(path)
    const session = {
      foldUrl: 'https://fold.example',
      cookie: 'session=sealed',
      expiresAt: Date.now() + 60_000,
    }

    await store.save(session)
    expect(await store.load()).toEqual(session)
    expect((await stat(path)).mode & 0o777).toBe(0o600)
    expect(await readFile(path, 'utf8')).not.toContain('password')

    await store.clear()
    expect(await store.load()).toBeNull()

    const expired = createSessionStore(path, () => 2_000)
    await expired.save({
      foldUrl: 'https://fold.example',
      cookie: 'session=sealed',
      expiresAt: 1_999,
    })
    expect(await expired.load()).toBeNull()
  })

  it('rejects corrupt or untrusted session files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fold-cli-test-'))
    const path = join(directory, 'session.json')
    const store = createSessionStore(path)

    await writeFile(path, '{')
    await expect(store.load()).rejects.toThrow(
      `The saved Fold session at ${path} is invalid`,
    )

    await writeFile(
      path,
      JSON.stringify({
        foldUrl: 'file:///tmp/fold',
        cookie: 'not-a-session',
        expiresAt: Date.now() + 60_000,
      }),
    )
    await expect(store.load()).rejects.toMatchObject({ exitCode: 3 })
  })
})
