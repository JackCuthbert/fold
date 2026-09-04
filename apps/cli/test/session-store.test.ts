import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createSessionStore } from '../src/session-store'

describe('session store', () => {
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
})
