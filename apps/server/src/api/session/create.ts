import { credentialsSchema } from '@fold/schemas'
import { useSecureCookie } from '../../config'
import { sessionCookie } from '../../session/cookie'
import { json, type Route } from '../route'

// POST /api/session — docs/specs/authentication.md
export const createSession: Route = {
  method: 'POST',
  path: '/api/session',
  handle: async (ctx) => {
    const credentials = credentialsSchema.parse(await ctx.request.json())
    await ctx.app.makeGateway(credentials).login()
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
