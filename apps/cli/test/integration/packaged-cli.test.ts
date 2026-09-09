import { sessionSchema, todoListSchema, todoSchema } from '@fold/schemas'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { z } from 'zod'

const execFileAsync = promisify(execFile)
const repoRoot = resolve(import.meta.dirname, '../../../..')
const cliEntry = resolve(repoRoot, 'apps/cli/dist/index.js')
const credentials = {
  serverUrl: 'https://caldav.example.test/user/',
  username: 'cli-integration',
  password: 'secret',
}
const locatedTodoSchema = z.object({ list: todoListSchema, todo: todoSchema })
const authOutputSchema = z.object({ session: sessionSchema })
const listOutputSchema = z.object({ todos: z.array(locatedTodoSchema) })
const todoOutputSchema = z.object({ todo: todoSchema })
const failedCommandSchema = z.object({
  stdout: z.string(),
  stderr: z.string(),
  code: z.number(),
})

let server: ChildProcess
let stateDir: string
let foldUrl: string
let serverStderr = ''

beforeAll(async () => {
  await execFileAsync(
    'bun',
    ['run', '--filter', '@jackcuthbert/fold-cli', 'build'],
    {
      cwd: repoRoot,
    },
  )
  stateDir = await mkdtemp(resolve(tmpdir(), 'fold-cli-integration-'))
  const port = await availablePort()
  foldUrl = `http://127.0.0.1:${port}`
  server = spawn('bun', ['run', '--filter', '@fold/server', 'start'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'development',
      SESSION_SECRET: 'cli-integration-secret',
      CALDAV_FAKE: '1',
      CALDAV_FAKE_CONFIRM: 'i-am-running-the-e2e-suite',
      CHECK_FOR_UPDATES: '0',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  server.stderr?.on('data', (chunk: Buffer) => {
    serverStderr += chunk.toString()
  })
  await waitForServer()

  const response = await fetch(`${foldUrl}/api/testing/fake`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      credentials,
      reset: true,
      lists: [
        {
          id: 'personal',
          displayName: 'Personal',
          todos: [{ uid: 'seeded-todo', summary: 'Existing todo' }],
        },
      ],
    }),
  })
  expect(response.ok).toBe(true)
}, 30_000)

afterAll(async () => {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM')
    await once(server, 'exit')
  }
  if (stateDir) await rm(stateDir, { recursive: true, force: true })
})

test('the packaged CLI completes its critical journey across processes', async () => {
  await fold(
    [
      'auth',
      'login',
      '--fold-url',
      foldUrl,
      '--server-url',
      credentials.serverUrl,
      '--username',
      credentials.username,
      '--json',
    ],
    authOutputSchema,
  )

  expect(
    (await fold(['auth', 'status', '--json'], authOutputSchema)).session
      .username,
  ).toBe(credentials.username)

  const initial = await fold(['todo', 'list', '--json'], listOutputSchema)
  expect(initial.todos).toMatchObject([
    { list: { displayName: 'Personal' }, todo: { uid: 'seeded-todo' } },
  ])
  expect(
    (await fold(['todo', 'view', 'seeded-todo', '--json'], todoOutputSchema))
      .todo,
  ).toMatchObject({ summary: 'Existing todo', completed: false })

  const created = await fold(
    ['todo', 'create', 'Packaged journey', '--list', 'Personal', '--json'],
    todoOutputSchema,
  )
  const uid = created.todo.uid
  expect(created.todo.summary).toBe('Packaged journey')

  expect(
    (
      await fold(
        ['todo', 'edit', uid, '--summary', 'Edited journey', '--json'],
        todoOutputSchema,
      )
    ).todo.summary,
  ).toBe('Edited journey')
  expect(
    (await fold(['todo', 'complete', uid, '--json'], todoOutputSchema)).todo
      .completed,
  ).toBe(true)
  expect(
    (await fold(['todo', 'delete', uid, '--yes', '--json'], todoOutputSchema))
      .todo.uid,
  ).toBe(uid)

  const remaining = await fold(
    ['todo', 'list', '--include-completed', '--json'],
    listOutputSchema,
  )
  expect(remaining.todos).toHaveLength(1)

  await fold(['auth', 'logout', '--json'], z.object({ message: z.string() }))
  const signedOut = await foldResult(['auth', 'status', '--json'])
  expect(signedOut.exitCode).toBe(3)
  expect(JSON.parse(signedOut.stderr)).toMatchObject({
    error: 'Not signed in; run fold auth login',
    exitCode: 3,
  })
}, 30_000)

test('the packaged CLI installs its bundled agent skill', async () => {
  const packageDir = await mkdtemp(resolve(tmpdir(), 'fold-cli-package-'))
  const projectDir = await mkdtemp(resolve(tmpdir(), 'fold-cli-project-'))
  const installedEntry = resolve(packageDir, 'dist/index.js')
  try {
    await cp(resolve(repoRoot, 'apps/cli/dist'), resolve(packageDir, 'dist'), {
      recursive: true,
    })
    const result = await execFileAsync(
      'node',
      [
        installedEntry,
        'skill',
        'install',
        '--agent',
        'codex',
        '--scope',
        'project',
      ],
      { cwd: projectDir },
    )
    expect(result.stderr).toBe('')
    expect(
      await readFile(
        resolve(projectDir, '.agents/skills/fold-todos/SKILL.md'),
        'utf8',
      ),
    ).toContain('name: fold-todos')
  } finally {
    await rm(packageDir, { recursive: true, force: true })
    await rm(projectDir, { recursive: true, force: true })
  }
})

async function fold<T>(args: string[], schema: z.ZodType<T>): Promise<T> {
  const result = await foldResult(args)
  expect(result.stderr).toBe('')
  expect(result.exitCode).toBe(0)
  return schema.parse(JSON.parse(result.stdout))
}

async function foldResult(args: string[]): Promise<{
  stdout: string
  stderr: string
  exitCode: number
}> {
  try {
    const result = await execFileAsync('node', [cliEntry, ...args], {
      cwd: repoRoot,
      env: {
        ...process.env,
        FOLD_PASSWORD: credentials.password,
        FOLD_STATE_DIR: stateDir,
      },
    })
    return { ...result, exitCode: 0 }
  } catch (error) {
    const failure = failedCommandSchema.parse(error)
    return {
      stdout: failure.stdout,
      stderr: failure.stderr,
      exitCode: failure.code,
    }
  }
}

async function waitForServer(attemptsRemaining = 100): Promise<void> {
  if (attemptsRemaining === 0) {
    throw new Error('Timed out waiting for Fold server')
  }
  if (server.exitCode !== null) {
    throw new Error(`Fold server exited early: ${serverStderr}`)
  }
  try {
    const response = await fetch(`${foldUrl}/api/session`)
    if (response.status < 500) return
  } catch {
    // Server is still starting.
  }
  await new Promise((resolveWait) => setTimeout(resolveWait, 50))
  return waitForServer(attemptsRemaining - 1)
}

async function availablePort(): Promise<number> {
  const probe = createServer()
  probe.listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const address = probe.address()
  if (address === null || typeof address === 'string') {
    throw new Error('Could not allocate a test port')
  }
  await new Promise<void>((resolveClose, reject) => {
    probe.close((error) => (error ? reject(error) : resolveClose()))
  })
  return address.port
}
