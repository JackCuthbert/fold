import { createListRequestSchema, todoListSchema } from '@fold/schemas'
import { json, parseResponse, requireCredentials, type Route } from '../route'

// POST /api/lists — docs/specs/lists.md
export const createList: Route = {
  method: 'POST',
  path: '/api/lists',
  handle: async (ctx) => {
    const credentials = await requireCredentials(ctx)
    const body = createListRequestSchema.parse(await ctx.request.json())
    const list = await ctx.app
      .makeGateway(credentials)
      .createList(body.id, body.displayName)
    return json(parseResponse(todoListSchema, list), 201)
  },
}
