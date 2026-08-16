import { json, requireCredentials, type Route } from '../route'

// GET /api/session — docs/specs/authentication.md
export const getSession: Route = {
  method: 'GET',
  path: '/api/session',
  handle: async (ctx) => {
    const credentials = await requireCredentials(ctx)
    return json({
      serverUrl: credentials.serverUrl,
      username: credentials.username,
    })
  },
}
