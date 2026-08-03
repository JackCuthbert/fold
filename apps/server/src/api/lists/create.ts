import { createListRequestSchema, todoListSchema } from '@fold/schemas'
import { json, parseResponse, requireCredentials, type Route } from '../route'

// POST /api/lists — docs/specs/lists.md
export const createList: Route = {
  method: 'POST',
  path: '/api/lists',
  handle: async (ctx) => {
    const credentials = await requireCredentials(ctx)
    const body = createListRequestSchema.parse(await ctx.request.json())
    // A new list can be born with a colour and a position rather than
    // needing a follow-up PROPPATCH — docs/specs/lists.md (a new list must
    // not jump, which needs its order set at creation).
    const props = {
      ...(body.color !== undefined ? { color: body.color } : {}),
      ...(body.order !== undefined ? { order: body.order } : {}),
    }
    const gateway = ctx.app.makeGateway(credentials)
    const list =
      Object.keys(props).length > 0
        ? await gateway.createList(body.id, body.displayName, props)
        : await gateway.createList(body.id, body.displayName)
    return json(parseResponse(todoListSchema, list), 201)
  },
}
