import { z } from 'zod'

const configSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  SESSION_SECRET: z.string().min(16),
  NODE_ENV: z.enum(['development', 'production']).default('development'),
})

export type Config = z.infer<typeof configSchema>

export function loadConfig(env: Record<string, string | undefined>): Config {
  return configSchema.parse(env)
}
