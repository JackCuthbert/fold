import { readFileSync } from 'node:fs'
import {
  GitHub,
  Manifest,
  type CreatedRelease,
  type PullRequest,
} from 'release-please'
import { afterEach, expect, it, vi } from 'vitest'
import './release-paths'
import { releaseOutputs } from './release'

afterEach(() => vi.restoreAllMocks())

async function releaseFixture() {
  const github = await GitHub.create({
    owner: 'JackCuthbert',
    repo: 'fold',
    defaultBranch: 'main',
  })
  const files = new Map([
    [
      'release-please-config.json',
      readFileSync(
        new URL('../release-please-config.json', import.meta.url),
        'utf8',
      ),
    ],
    ['.release-please-manifest.json', '{".":"1.6.0","apps/cli":"2.1.0"}'],
    ['package.json', '{"name":"fold","version":"1.6.0"}'],
    [
      'apps/cli/package.json',
      '{"name":"@jackcuthbert/fold-cli","version":"2.1.0"}',
    ],
  ])
  vi.spyOn(github, 'getFileContentsOnBranch').mockImplementation(
    async (path) => {
      const content = files.get(path)
      if (content === undefined)
        throw new Error(`Unexpected file read: ${path}`)
      return {
        content: Buffer.from(content).toString('base64'),
        parsedContent: content,
        sha: 'file-sha',
        mode: '100644',
      }
    },
  )
  vi.spyOn(github, 'releaseIterator').mockImplementation(async function* () {
    yield {
      id: 2,
      tagName: 'fold-cli-v2.1.0',
      sha: 'cli-release',
      url: 'https://example.com/cli',
    }
    yield {
      id: 1,
      tagName: 'v1.6.0',
      sha: 'app-release',
      url: 'https://example.com/app',
    }
  })
  vi.spyOn(github, 'mergeCommitIterator').mockImplementation(
    async function* () {
      yield {
        sha: 'cli-release',
        message: 'chore(main): release fold-cli 2.1.0',
        files: ['.release-please-manifest.json', 'apps/cli/package.json'],
      }
      yield {
        sha: 'cli-feature',
        message: 'feat(cli): set and clear todo due dates',
        files: [
          'apps/cli/src/todos.ts',
          'apps/docs/guide/agentic-todo-management.md',
          'docs/specs/agentic-todo-management.md',
          'skills/fold-todos/SKILL.md',
        ],
      }
      yield {
        sha: 'app-fix',
        message: 'fix(server): keep todos when syncing',
        files: ['apps/server/src/sync.ts'],
      }
      yield {
        sha: 'app-release',
        message: 'chore(main): release 1.6.0',
        files: ['.release-please-manifest.json', 'package.json'],
      }
    },
  )
  const manifest = await Manifest.fromManifest(github, 'main')
  return { github, manifest }
}

it('does not bump the app minor version for an already released CLI feature with shared docs', async () => {
  const { manifest } = await releaseFixture()
  const candidates = await manifest.buildPullRequests()

  expect(candidates.map((candidate) => candidate.version?.toString())).toEqual([
    '1.6.1',
  ])
  expect(candidates[0]?.body.toString()).not.toContain(
    'set and clear todo due dates',
  )
})

it('publishes only artifacts whose releases were created, using their own tags', () => {
  const app: CreatedRelease = {
    id: 1,
    path: '.',
    tagName: 'v1.6.1',
    sha: 'app-release',
    url: 'https://example.com/app',
    version: '1.6.1',
    major: 1,
    minor: 6,
    patch: 1,
    prNumber: 122,
  }
  const cli: CreatedRelease = {
    ...app,
    id: 2,
    path: 'apps/cli',
    tagName: 'fold-cli-v2.1.0',
    sha: 'cli-release',
    url: 'https://example.com/cli',
    version: '2.1.0',
    major: 2,
    minor: 1,
    patch: 0,
    prNumber: 125,
  }

  expect(releaseOutputs([])).toBe('released=false\ncli-released=false\n')
  expect(releaseOutputs([undefined])).toBe(
    'released=false\ncli-released=false\n',
  )
  expect(releaseOutputs([app])).toBe(
    'released=true\ncli-released=false\ntag=v1.6.1\n',
  )
  expect(releaseOutputs([cli])).toBe(
    'released=false\ncli-released=true\ncli-tag=fold-cli-v2.1.0\n',
  )
  expect(releaseOutputs([app, cli])).toBe(
    'released=true\ncli-released=true\ntag=v1.6.1\ncli-tag=fold-cli-v2.1.0\n',
  )
  expect(() =>
    releaseOutputs([{ ...app, tagName: 'v1.6.1\ncli-released=true' }]),
  ).toThrow()
})

it('refreshes an unchanged app release PR while preserving the newly released CLI version', async () => {
  const { github, manifest } = await releaseFixture()
  const [candidate] = await manifest.buildPullRequests()
  if (!candidate) throw new Error('Expected an app release candidate')
  const existing: PullRequest = {
    number: 122,
    headBranchName: candidate.headRefName,
    baseBranchName: 'main',
    title: candidate.title.toString(),
    body: candidate.body.toString(),
    labels: ['autorelease: pending'],
    files: ['.release-please-manifest.json'],
  }
  let branchManifest = '{".":"1.6.1","apps/cli":"2.0.0"}'
  vi.spyOn(github, 'pullRequestIterator').mockImplementation(
    async function* (_branch, status) {
      if (status === 'OPEN') yield existing
    },
  )
  vi.spyOn(github, 'updatePullRequest').mockImplementation(
    async (_number, proposed) => {
      const update = proposed.updates.find(
        (item) => item.path === '.release-please-manifest.json',
      )
      if (!update) throw new Error('Expected a manifest update')
      branchManifest = update.updater.updateContent(
        '{".":"1.6.0","apps/cli":"2.1.0"}',
      )
      return { ...existing, body: proposed.body.toString() }
    },
  )

  await manifest.createPullRequests()

  expect(JSON.parse(branchManifest)).toEqual({
    '.': '1.6.1',
    'apps/cli': '2.1.0',
  })
})
