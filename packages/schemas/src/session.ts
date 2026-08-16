import { z } from 'zod'

export const credentialsSchema = z.object({
  serverUrl: z.url(),
  username: z.string().min(1),
  password: z.string().min(1),
})
export type Credentials = z.infer<typeof credentialsSchema>

export const sessionSchema = credentialsSchema.omit({ password: true })
export type Session = z.infer<typeof sessionSchema>
