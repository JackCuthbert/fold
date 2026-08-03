import { renameListRequestSchema } from '@fold/schemas'
import { requireCredentials, type Route } from '../route'

// PATCH /api/lists/:listId — docs/specs/lists.md
export const renameList: Route = {
  method: 'PATCH',
  path: '/api/lists/:listId',
  handle: async (ctx) => {
    const credentials = await requireCredentials(ctx)
    const body = renameListRequestSchema.parse(await ctx.request.json())
    // Task 6 rewrites this handler to cover color/order too; for now
    // displayName is the only field this route acts on, so guard the case
    // patchListRequestSchema now allows (colour/order-only PATCH) rather
    // than widening this handler's behaviour.
    if (body.displayName === undefined) {
      return new Response(null, { status: 204 })
    }
    await ctx.app
      .makeGateway(credentials)
      .renameList(ctx.params['listId'] ?? '', body.displayName)
    return new Response(null, { status: 204 })
  },
}
