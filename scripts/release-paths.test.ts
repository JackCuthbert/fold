import { describe, expect, it } from 'vitest'
import { filterReleaseCommits } from './release-paths'

describe('release commit routing', () => {
  it.each([
    ['client', ['apps/client/src/main.tsx'], true, false],
    ['server', ['apps/server/src/index.ts'], true, false],
    ['shared schemas', ['packages/schemas/src/todo.ts'], true, false],
    ['shared vtodo', ['packages/vtodo/src/index.ts'], true, false],
    ['shared outbox', ['packages/outbox/src/index.ts'], true, false],
    ['Dockerfile', ['Dockerfile'], true, false],
    ['root manifest', ['package.json'], true, false],
    ['lockfile', ['bun.lock'], true, false],
    ['CLI', ['apps/cli/src/todos.ts'], false, true],
    [
      'CLI with shared docs and skill changes',
      [
        'apps/cli/src/todos.ts',
        'apps/docs/guide/agentic-todo-management.md',
        'docs/specs/agentic-todo-management.md',
        'skills/fold-todos/SKILL.md',
      ],
      false,
      true,
    ],
    ['shared docs', ['docs/specs/releases.md'], false, false],
    ['user guide', ['apps/docs/guide/index.md'], false, false],
    ['skill', ['skills/fold-todos/SKILL.md'], false, false],
    [
      'tooling',
      ['.github/workflows/ci.yml', 'scripts/release.ts'],
      false,
      false,
    ],
    ['root readme', ['README.md'], false, false],
    ['prefix lookalike', ['apps/client-old/src/main.tsx'], false, false],
    ['empty commit', [], false, false],
    [
      'mixed app and CLI',
      ['apps/client/src/main.tsx', 'apps/cli/src/todos.ts'],
      true,
      true,
    ],
  ])('routes %s changes', (_name, files, app, cli) => {
    const commit = { sha: 'feature', message: 'feat: change behavior', files }
    const commits = { '.': [commit], 'apps/cli': [commit] }

    filterReleaseCommits(commits)

    expect(commits['.']).toEqual(app ? [commit] : [])
    expect(commits['apps/cli']).toEqual(cli ? [commit] : [])
  })
})
