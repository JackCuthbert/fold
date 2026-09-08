import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { createPrompter } from '../src/prompt'

describe('terminal prompts', () => {
  it.each([
    { method: 'password' as const, answer: ' secret ', expected: ' secret ' },
    { method: 'text' as const, answer: ' jack ', expected: 'jack' },
    { method: 'confirm' as const, answer: ' yes ', expected: true },
  ])(
    'handles whitespace in $method input',
    async ({ method, answer, expected }) => {
      const input = Object.assign(new PassThrough(), { isTTY: true })
      const output = Object.assign(new PassThrough(), { isTTY: true })
      const descriptors = Object.getOwnPropertyDescriptors(process)
      Object.defineProperty(process, 'stdin', { get: () => input })
      Object.defineProperty(process, 'stdout', { get: () => output })
      try {
        const pending = createPrompter()[method]('Prompt')
        input.write(`${answer}\n`)

        expect(await pending).toBe(expected)
      } finally {
        Object.defineProperty(process, 'stdin', descriptors.stdin)
        Object.defineProperty(process, 'stdout', descriptors.stdout)
        input.destroy()
        output.destroy()
      }
    },
  )
})
