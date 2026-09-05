import { randomUUID } from 'node:crypto'
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import { CliError } from './errors'

const storedSessionSchema = z.object({
  foldUrl: z.url(),
  cookie: z.string().startsWith('session='),
  expiresAt: z.number().int().positive(),
})

export type StoredSession = z.infer<typeof storedSessionSchema>

export interface SessionStore {
  load(): Promise<StoredSession | null>
  save(session: StoredSession): Promise<void>
  clear(): Promise<void>
}

export const sessionPath = (
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  userHome = homedir(),
): string => {
  if (env['FOLD_STATE_DIR']) {
    return join(resolve(env['FOLD_STATE_DIR']), 'session.json')
  }
  if (platform === 'darwin') {
    return join(
      userHome,
      'Library',
      'Application Support',
      'Fold',
      'session.json',
    )
  }
  const stateHome = env['XDG_STATE_HOME'] ?? join(userHome, '.local', 'state')
  return join(stateHome, 'fold', 'session.json')
}

export const createSessionStore = (
  path = sessionPath(),
  now: () => number = Date.now,
): SessionStore => ({
  async load() {
    let value: string
    try {
      value = await readFile(path, 'utf8')
    } catch (error) {
      if (isMissing(error)) return null
      throw error
    }

    let json: unknown
    try {
      json = JSON.parse(value)
    } catch {
      throw invalidSession(path)
    }
    const parsed = storedSessionSchema.safeParse(json)
    if (!parsed.success) {
      throw invalidSession(path)
    }
    if (parsed.data.expiresAt <= now()) {
      await rm(path, { force: true })
      return null
    }
    return parsed.data
  },

  async save(session) {
    const directory = dirname(path)
    await mkdir(directory, { recursive: true, mode: 0o700 })
    await chmod(directory, 0o700)
    const temporary = `${path}.${randomUUID()}.tmp`
    await writeFile(temporary, `${JSON.stringify(session)}\n`, { mode: 0o600 })
    await rename(temporary, path)
    await chmod(path, 0o600)
  },

  async clear() {
    await rm(path, { force: true })
  },
})

const isMissing = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT'

const invalidSession = (path: string): CliError =>
  new CliError(
    `The saved Fold session at ${path} is invalid; run fold auth login`,
    3,
  )
