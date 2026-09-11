import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { CliError } from './errors'

const skillName = 'fold-todos'

export const skillInstallOptionsSchema = z.object({
  agent: z.enum(['codex', 'claude', 'all']).default('all'),
  scope: z.enum(['user', 'project']),
})

export type SkillInstallOptions = z.infer<typeof skillInstallOptionsSchema>

export function parseSkillInstallOptions(input: unknown): SkillInstallOptions {
  const parsed = skillInstallOptionsSchema.safeParse(input)
  if (parsed.success) return parsed.data
  const field = parsed.error.issues[0]?.path[0]
  if (field === 'agent') {
    throw new CliError('--agent must be codex, claude, or all', 2)
  }
  throw new CliError('--scope must be user or project', 2)
}

export async function installSkill(
  options: SkillInstallOptions,
  cwd: string,
  home = homedir(),
): Promise<string> {
  const target = skillPath(options, cwd, home)
  await mkdir(dirname(target), { recursive: true })
  try {
    await writeFile(target, await readSkill(), { encoding: 'utf8', flag: 'wx' })
  } catch (error) {
    if (hasCode(error, 'EEXIST')) {
      throw new CliError(`Skill already exists at ${target}`)
    }
    throw error
  }
  return target
}

const skillPath = (
  { agent, scope }: SkillInstallOptions,
  cwd: string,
  home: string,
): string => {
  const root = scope === 'project' ? cwd : home
  const directory =
    agent === 'codex'
      ? '.codex/skills'
      : agent === 'claude'
        ? '.claude/skills'
        : '.agents/skills'
  return resolve(root, directory, skillName, 'SKILL.md')
}

const readSkill = async (): Promise<string> => {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url))
  const bundled = resolve(moduleDirectory, `${skillName}-SKILL.md`)
  try {
    return await readFile(bundled, 'utf8')
  } catch (error) {
    if (!hasCode(error, 'ENOENT')) throw error
  }
  return readFile(
    resolve(moduleDirectory, '../../../skills', skillName, 'SKILL.md'),
    'utf8',
  )
}

const hasCode = (error: unknown, code: string): boolean =>
  error instanceof Error && 'code' in error && error.code === code
