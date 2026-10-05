import { appendFileSync } from 'node:fs'
import { GitHub, Manifest, type CreatedRelease } from 'release-please'
import { z } from 'zod'
import './release-paths'

const releasedArtifact = z.object({
  path: z.enum(['.', 'apps/cli']),
  tagName: z
    .string()
    .min(1)
    .regex(/^[^\r\n]+$/),
})

export function releaseOutputs(releases: (CreatedRelease | undefined)[]) {
  const outputs: Record<string, string> = {
    released: 'false',
    'cli-released': 'false',
  }
  for (const release of releases) {
    if (!release) continue
    const artifact = releasedArtifact.parse(release)
    if (artifact.path === '.') {
      outputs['released'] = 'true'
      outputs['tag'] = artifact.tagName
    } else {
      outputs['cli-released'] = 'true'
      outputs['cli-tag'] = artifact.tagName
    }
  }
  return Object.entries(outputs)
    .map(([key, value]) => `${key}=${value}\n`)
    .join('')
}

async function main() {
  const env = z
    .object({
      GITHUB_TOKEN: z.string().min(1),
      GITHUB_REPOSITORY: z
        .string()
        .transform((value) => value.split('/'))
        .pipe(z.tuple([z.string().min(1), z.string().min(1)])),
      GITHUB_OUTPUT: z.string().min(1),
    })
    .parse(process.env)

  const [owner, repo] = env.GITHUB_REPOSITORY
  const github = await GitHub.create({
    owner,
    repo,
    token: env.GITHUB_TOKEN,
    defaultBranch: 'main',
  })
  const manifest = await Manifest.fromManifest(github, 'main')
  appendFileSync(
    env.GITHUB_OUTPUT,
    releaseOutputs(await manifest.createReleases()),
  )

  // Reload after tagging, as release-please-action does, before refreshing pending PRs.
  await (await Manifest.fromManifest(github, 'main')).createPullRequests()
}

if (import.meta.main) await main()
