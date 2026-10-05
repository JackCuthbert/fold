import { registerPlugin, type Commit, type Strategy } from 'release-please'
import { ManifestPlugin } from 'release-please/build/src/plugin.js'
import { z } from 'zod'

const changedFiles = z.array(z.string())

function filterReleaseCommits(commits: Record<string, Commit[]>) {
  for (const [path, candidates] of Object.entries(commits)) {
    commits[path] = candidates.filter((commit) =>
      changedFiles
        .parse(commit.files)
        .some((file) =>
          path === '.'
            ? ['Dockerfile', 'package.json', 'bun.lock'].includes(file) ||
              ['apps/client/', 'apps/server/', 'packages/'].some((prefix) =>
                file.startsWith(prefix),
              )
            : file.startsWith(`${path}/`),
        ),
    )
  }
}

class ReleasePaths extends ManifestPlugin {
  override async preconfigure(
    strategies: Record<string, Strategy>,
    commits: Record<string, Commit[]>,
  ) {
    filterReleaseCommits(commits)
    return strategies
  }
}

registerPlugin(
  'fold-paths',
  (options) =>
    new ReleasePaths(
      options.github,
      options.targetBranch,
      options.repositoryConfig,
    ),
)
