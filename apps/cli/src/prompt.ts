import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'
import { CliError } from './errors'

export interface Prompter {
  text(label: string, initial?: string): Promise<string>
  password(label: string): Promise<string>
  confirm(label: string): Promise<boolean>
}

export const createPrompter = (): Prompter => ({
  async text(label, initial) {
    const answer = await question(
      `${label}${initial ? ` (${initial})` : ''}: `,
      false,
    )
    return answer || initial || ''
  },
  password: (label) => question(`${label}: `, true),
  async confirm(label) {
    const answer = (await question(`${label} [y/N]: `, false)).toLowerCase()
    return answer === 'y' || answer === 'yes'
  },
})

const question = async (label: string, hidden: boolean): Promise<string> => {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new CliError('Interactive input requires a terminal', 2)
  }

  const output = new MutedOutput()
  const prompt = createInterface({
    input: process.stdin,
    output,
    terminal: true,
  })
  try {
    const pending = prompt.question(label)
    output.muted = hidden
    const answer = await pending
    if (hidden) process.stdout.write('\n')
    return answer.trim()
  } finally {
    output.muted = false
    prompt.close()
  }
}

class MutedOutput extends Writable {
  muted = false

  override _write(
    chunk: string | Buffer,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    if (!this.muted) process.stdout.write(chunk, encoding)
    callback()
  }
}
