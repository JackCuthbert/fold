import { execFile, spawnSync } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const IMAGE = 'tomsquest/docker-radicale:3.5.4.0'
const CONTAINER_PREFIX = 'caldav-todo-e2e-radicale'

export interface RadicaleContainer {
  url: string
  containerId: string
}

async function dockerAvailable(): Promise<boolean> {
  try {
    await execFileAsync('docker', ['info'])
    return true
  } catch {
    return false
  }
}

/**
 * Starts a throwaway, unauthenticated Radicale container for the e2e
 * suite and returns its resolved `http://127.0.0.1:<port>` URL. Docker
 * assigns the host port (`-p 127.0.0.1::5232`), so two checkouts running
 * `bun run test:e2e` at the same time never collide on a fixed port —
 * see docs/specs/testing.md and the open port-collision task this
 * replaces.
 *
 * The container name carries the process id so concurrent runs also get
 * distinct names (Docker rejects a duplicate name outright, which would
 * otherwise surface as a confusing failure). No config or volume is
 * mounted: the image's built-in default config already sets
 * `[auth] type = none`, matching the old `--auth-type none` CLI flag, and
 * an ephemeral in-container storage path is fine for a throwaway run.
 */
export async function startRadicaleContainer(): Promise<RadicaleContainer> {
  if (!(await dockerAvailable())) {
    throw new Error(
      'docker is not available — the e2e suite needs Docker to run a ' +
        'throwaway Radicale container (see compose.yml). Start Docker ' +
        'Desktop (or the Docker daemon) and try again.',
    )
  }

  const name = `${CONTAINER_PREFIX}-${process.pid}`
  let containerId: string
  try {
    const { stdout } = await execFileAsync('docker', [
      'run',
      '--rm',
      '-d',
      '--name',
      name,
      '-p',
      '127.0.0.1::5232',
      IMAGE,
    ])
    containerId = stdout.trim()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `docker run failed — is the ${IMAGE} image available? ${message}`,
      { cause: error },
    )
  }

  try {
    const port = await resolveHostPort(containerId)
    const url = `http://127.0.0.1:${port}`
    await waitUntilReady(url, containerId)
    return { url, containerId }
  } catch (error) {
    stopRadicaleContainer(containerId)
    throw error
  }
}

/** Synchronous so it can run unconditionally from a teardown hook. */
export function stopRadicaleContainer(containerId: string): void {
  spawnSync('docker', ['rm', '-f', containerId], { stdio: 'ignore' })
}

async function resolveHostPort(containerId: string): Promise<string> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    try {
      const { stdout } = await execFileAsync('docker', [
        'port',
        containerId,
        '5232/tcp',
      ])
      const match = /:(\d+)\s*$/.exec(stdout.trim())
      if (match?.[1]) return match[1]
    } catch {
      // container may not have registered its port mapping yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(
    `docker never reported a host port for container ${containerId}`,
  )
}

async function waitUntilReady(url: string, containerId: string): Promise<void> {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    try {
      await fetch(url, { method: 'OPTIONS' })
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }
  throw new Error(
    `radicale container ${containerId} did not become ready at ${url} ` +
      'within 15s',
  )
}
