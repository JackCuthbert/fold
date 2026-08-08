import { credentialsSchema, type Credentials } from '@fold/schemas'
import { z } from 'zod'
import { seal, unseal } from '../crypto/seal'

const NAME = 'session'

// `SameSite=Strict` is deliberate, and was reconsidered when the session
// lifetime below was fixed. It costs a login screen on the first load when
// you arrive from an external link (the cookie is withheld until a
// same-site navigation), which `Lax` would avoid. Kept anyway: CSRF cover
// here should not rest solely on the API being JSON-only and same-origin,
// and `Strict` is the setting that stays correct if a future route is ever
// reachable by a cross-site GET. *(reaffirmed 2026-08-08.)*
const BASE = 'Path=/; HttpOnly; SameSite=Strict'

/**
 * How long a session survives without being used, in seconds.
 *
 * The cookie carries sealed CalDAV credentials, so this is deliberately a
 * *window of use on a lost device*, not a convenience setting — hence days
 * rather than the year a "remember me" checkbox usually implies. Seven
 * days of inactivity is the point at which asking again is reasonable.
 */
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60

/**
 * How old a cookie must be before a request bothers to renew it.
 *
 * Renewing on *every* authenticated request is what makes sliding expiry
 * sound in principle and wrong in practice: a request already in flight
 * when the session ends still carries the old cookie, still authenticates,
 * and hands a working session straight back — **resurrecting a session
 * that was just cleared**. Sign out while a poll is in the air and you are
 * silently signed back in.
 *
 * Renewing only in the last two-thirds of the cookie's life closes that
 * window. An in-flight request racing a sign-out is, by definition,
 * carrying a cookie minted at most seconds ago, so it renews nothing. A
 * session in genuine daily use is always older than this by the time it is
 * touched, so the sliding expiry still does its job.
 *
 * *(added 2026-08-08: renewal on every request re-issued the cookie after
 * `clearCookies()`, and would have done the same on a real sign-out.)*
 */
export const RENEW_AFTER_SECONDS = SESSION_MAX_AGE_SECONDS / 3

/**
 * Build the `Set-Cookie` for a signed-in session.
 *
 * The lifetime is **explicit**. Without `Max-Age` this was a *session*
 * cookie, discarded whenever the browser decided its session had ended —
 * which on desktop is close to never, but on iOS happens as soon as Safari
 * evicts a backgrounded tab. That is why the app appeared to log itself
 * out on an iPhone while a desktop tab stayed signed in for weeks: the
 * cookie was doing exactly what it was asked to.
 * *(fixed 2026-08-08.)*
 */
export async function sessionCookie(
  credentials: Credentials,
  secret: string,
  secure: boolean,
  issuedAt: number = Date.now(),
): Promise<string> {
  // `iat` rides *inside* the sealed payload, so it cannot be forged to make
  // a cookie look older (and thus renewable) than it is. The cookie's own
  // `Max-Age` is not readable by the server on the way back in — only the
  // browser sees it — so age has to be carried here to be known at all.
  const sealed = await seal(
    JSON.stringify({ ...credentials, iat: issuedAt }),
    secret,
  )
  return [
    `${NAME}=${sealed}`,
    BASE,
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ')
}

export function clearSessionCookie(): string {
  return `${NAME}=; ${BASE}; Max-Age=0`
}

/** The credentials plus when the cookie carrying them was minted. */
export interface SessionRecord {
  credentials: Credentials
  /** `Date.now()` at issue, or `null` for a cookie minted before `iat`. */
  issuedAt: number | null
}

// `iat` is optional so a cookie issued before this field existed still
// unseals rather than logging everyone out on deploy. A missing one reads
// as "age unknown", which `shouldRenew` treats as renewable — the safe
// direction, since the alternative is a session that can never slide.
const recordSchema = credentialsSchema.extend({
  iat: z.number().optional(),
})

export async function readSessionRecord(
  request: Request,
  secret: string,
): Promise<SessionRecord | null> {
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
  const parsed = recordSchema.safeParse(JSON.parse(plaintext))
  if (!parsed.success) return null
  const { iat, ...credentials } = parsed.data
  return { credentials, issuedAt: iat ?? null }
}

export async function readSession(
  request: Request,
  secret: string,
): Promise<Credentials | null> {
  const record = await readSessionRecord(request, secret)
  return record?.credentials ?? null
}

/**
 * Is this cookie old enough to be worth re-issuing?
 *
 * See `RENEW_AFTER_SECONDS` for why renewing every request is unsound.
 * A cookie whose age cannot be determined renews, so sessions predating
 * the `iat` field still slide.
 */
export function shouldRenew(
  issuedAt: number | null,
  now: number = Date.now(),
): boolean {
  if (issuedAt === null) return true
  return now - issuedAt >= RENEW_AFTER_SECONDS * 1000
}
