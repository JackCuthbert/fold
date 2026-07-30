import { listsResponseSchema } from '@caldav-todo/schemas'
import { json, parseResponse, requireCredentials, type Route } from '../route'

// GET /api/lists — docs/specs/lists.md
export const listLists: Route = {
  method: 'GET',
  path: '/api/lists',
  handle: async (ctx) => {
    const credentials = await requireCredentials(ctx)
    const lists = await ctx.app.makeGateway(credentials).fetchLists()
    return json(parseResponse(listsResponseSchema, lists))
  },
}
