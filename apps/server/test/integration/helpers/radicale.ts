const IMAGE = 'tomsquest/docker-radicale:3.5.4.0'

export interface RadicaleHandle {
  url: string
  stop: () => void
}

async function dockerAvailable(): Promise<boolean> {
  try {
    const proc = Bun.spawn(['docker', 'info'], {
      stdout: 'ignore',
      stderr: 'ignore',
    })
    return (await proc.exited) === 0
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

  const run = Bun.spawn(
    ['docker', 'run', '--rm', '-d', '-p', '127.0.0.1::5232', IMAGE],
    { stdout: 'pipe', stderr: 'pipe' },
  )
  const [runExitCode, stdout, stderr] = await Promise.all([
    run.exited,
    new Response(run.stdout).text(),
    new Response(run.stderr).text(),
  ])
  if (runExitCode !== 0) {
    throw new Error(
      `docker run failed (exit ${runExitCode}) — is the ${IMAGE} image ` +
        `available? stderr: ${stderr.trim()}`,
    )
  }
  const containerId = stdout.trim()
  const stop = (): void => {
    Bun.spawnSync(['docker', 'rm', '-f', containerId], {
      stdout: 'ignore',
      stderr: 'ignore',
    })
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
    const proc = Bun.spawn(['docker', 'port', containerId, '5232/tcp'], {
      stdout: 'pipe',
      stderr: 'ignore',
    })
    const [exitCode, stdout] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
    ])
    const match = /:(\d+)\s*$/.exec(stdout.trim())
    if (exitCode === 0 && match?.[1]) return match[1]
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
