import { credentialsSchema, type Credentials } from '@caldav-todo/schemas'
import { seal, unseal } from '../crypto/seal'

const NAME = 'session'
const BASE = 'Path=/; HttpOnly; SameSite=Strict'

export async function sessionCookie(
  credentials: Credentials,
  secret: string,
  secure: boolean,
): Promise<string> {
  const sealed = await seal(JSON.stringify(credentials), secret)
  return `${NAME}=${sealed}; ${BASE}${secure ? '; Secure' : ''}`
}

export function clearSessionCookie(): string {
  return `${NAME}=; ${BASE}; Max-Age=0`
}

export async function readSession(
  request: Request,
  secret: string,
): Promise<Credentials | null> {
  const header = request.headers.get('cookie')
  if (!header) return null
  const pair = header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${NAME}=`))
  if (!pair) return null
  const plaintext = await unseal(pair.slice(NAME.length + 1), secret)
  if (plaintext === null) return null
  // Trust boundary: the cookie came from the network.
  const parsed = credentialsSchema.safeParse(JSON.parse(plaintext))
  return parsed.success ? parsed.data : null
}
