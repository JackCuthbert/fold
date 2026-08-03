import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'

const IMAGE = 'tomsquest/docker-radicale:3.5.4.0'

/**
 * Docker is driven through `node:child_process` rather than `Bun.spawn`.
 *
 * Both runtimes implement it, which is what matters here: `Bun.spawn` only
 * exists under `bun --bun`, and that flag makes Bun's own resolver run
 * ahead of vitest's — which resolves zod's `@zod/source` export condition
 * to raw TypeScript that vitest's transform pipeline cannot load, so every
 * `z.object(...)` throws "undefined is not an object" at import time.
 *
 * Keeping this file runtime-agnostic lets the suite run without `--bun`,
 * so zod resolves to its built entry like everywhere else.
 *
 * *(changed 2026-08-03: was Bun.spawn. The clash was latent until the
 * CalDAV gateway imported a *value* — not just a type — from
 * @fold/schemas; before that the schemas package was erased at compile
 * time and zod was never loaded in this suite at all.)*
 */
const run = promisify(execFile)

export interface RadicaleHandle {
  url: string
  stop: () => void
}

async function dockerAvailable(): Promise<boolean> {
  try {
    await run('docker', ['info'])
    return true
  } catch {
    return false
  }
}

/**
 * Starts a throwaway, unauthenticated Radicale container for the
 * integration suite. Docker assigns the host port (`-p 127.0.0.1::5232`)
 * so concurrent test runs never collide on a fixed port — see
 * docs/specs/testing.md. The container is unnamed-but-tracked by id and
 * always removed in `stop()`, including on failure to become ready.
 *
 * No config is mounted: the image's built-in default config already sets
 * `[auth] type = none`, matching the old `--auth-type none` CLI flag, and
 * stores collections at the ephemeral in-container path `/data/collections`
 * — there is nothing worth persisting for a throwaway run, so no volume is
 * mounted either.
 */
export async function startRadicale(): Promise<RadicaleHandle> {
  if (!(await dockerAvailable())) {
    throw new Error(
      'docker is not available — the integration suite needs Docker to ' +
        'run a throwaway Radicale container (see compose.yml). Start ' +
        'Docker Desktop (or the Docker daemon) and try again.',
    )
  }

  let containerId: string
  try {
    const { stdout } = await run('docker', [
      'run',
      '--rm',
      '-d',
      '-p',
      '127.0.0.1::5232',
      IMAGE,
    ])
    containerId = stdout.trim()
  } catch (error) {
    const stderr =
      error instanceof Error && 'stderr' in error
        ? String((error as { stderr: unknown }).stderr).trim()
        : String(error)
    throw new Error(
      `docker run failed — is the ${IMAGE} image available? ` +
        `stderr: ${stderr}`,
      { cause: error },
    )
  }

  const stop = (): void => {
    try {
      execFileSync('docker', ['rm', '-f', containerId], { stdio: 'ignore' })
    } catch {
      // Best effort: the container may already be gone (`--rm`), and a
      // failure to clean up must not mask the test's own result.
    }
  }

  try {
    const port = await resolveHostPort(containerId)
    const url = `http://127.0.0.1:${port}`
    await waitUntilReady(url, containerId)
    return { url, stop }
  } catch (error) {
    stop()
    throw error
  }
}

async function resolveHostPort(containerId: string): Promise<string> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    try {
      const { stdout } = await run('docker', ['port', containerId, '5232/tcp'])
      const match = /:(\d+)\s*$/.exec(stdout.trim())
      if (match?.[1]) return match[1]
    } catch {
      // Docker may not have published the port yet; retry until deadline.
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
