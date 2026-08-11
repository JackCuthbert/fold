import { credentialsSchema } from '@fold/schemas'
import { attemptKey } from '../../auth/attempt-limit'
import { CaldavError } from '../../caldav/errors'
import { useSecureCookie } from '../../config'
import { HttpError } from '../../http/errors'
import { sessionCookie } from '../../session/cookie'
import { json, type Route } from '../route'

// POST /api/session — docs/specs/authentication.md
export const createSession: Route = {
  method: 'POST',
  path: '/api/session',
  handle: async (ctx) => {
    const credentials = credentialsSchema.parse(await ctx.request.json())

    // Sign-in is the only route that acts on an unauthenticated caller's
    // instructions — it takes an arbitrary `serverUrl` and goes and tries
    // credentials against it. Capping failures stops Fold being used as an
    // anonymous credential-testing relay into the network it runs on
    // (docs/specs/security.md).
    // The slot is taken *before* the upstream call, not after it fails.
    // Counting on failure leaves a window wide enough to drive a bus
    // through: 40 requests fired at once all read the counter before any
    // of them writes to it, so all 40 pass a cap of 5 — measured, not
    // theorised. See `reserve`.
    const key = attemptKey(credentials.serverUrl, credentials.username)
    const slot = ctx.app.signInAttempts.reserve(key)
    if (!slot.ok) {
      throw new HttpError(
        429,
        'too_many_attempts',
        'Too many failed sign-in attempts. Try again shortly.',
        // Standard for a 429, and the client shows the wait rather than
        // guessing (docs/specs/api.md — error mapping).
        { 'retry-after': String(slot.retryAfterSeconds) },
      )
    }

    try {
      await ctx.app.makeGateway(credentials).login()
    } catch (error) {
      // Only a *credential* rejection keeps the slot. A server that is
      // unreachable, or broken, or slow, says nothing about whether the
      // password was right — holding those against the user would let a
      // CalDAV outage lock out the very person waiting for it to recover.
      if (!(error instanceof CaldavError && error.status === 401)) {
        ctx.app.signInAttempts.release(key)
      }
      throw error
    }

    // A correct sign-in forgives earlier fumbles, so someone who mistyped
    // twice and then got it right starts clean rather than carrying a
    // count toward a lockout they will never understand.
    ctx.app.signInAttempts.recordSuccess(key)

    const cookie = await sessionCookie(
      credentials,
      ctx.app.config.SESSION_SECRET,
      useSecureCookie(ctx.app.config),
    )
    return json(
      { serverUrl: credentials.serverUrl, username: credentials.username },
      200,
      { 'set-cookie': cookie },
    )
  },
}
