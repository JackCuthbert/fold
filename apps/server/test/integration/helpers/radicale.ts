import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface RadicaleHandle {
  url: string
  stop: () => void
}

export async function startRadicale(): Promise<RadicaleHandle> {
  const storage = mkdtempSync(join(tmpdir(), 'radicale-'))
  const port = 40000 + Math.floor(Math.random() * 10000)
  const proc = Bun.spawn(
    [
      'radicale',
      '--server-hosts',
      `127.0.0.1:${port}`,
      '--storage-filesystem-folder',
      storage,
      '--auth-type',
      'none',
    ],
    { stderr: 'pipe', stdout: 'pipe' },
  )
  const url = `http://127.0.0.1:${port}`
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    try {
      await fetch(url, { method: 'OPTIONS' })
      return { url, stop: () => proc.kill() }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }
  proc.kill()
  throw new Error(
    'radicale did not start — is it installed? (uv tool install radicale)',
  )
}
