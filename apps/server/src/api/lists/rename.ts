import { renameListRequestSchema } from '@caldav-todo/schemas'
import { requireCredentials, type Route } from '../route'

// PATCH /api/lists/:listId — docs/specs/lists.md
export const renameList: Route = {
  method: 'PATCH',
  path: '/api/lists/:listId',
  handle: async (ctx) => {
    const credentials = await requireCredentials(ctx)
    const body = renameListRequestSchema.parse(await ctx.request.json())
    await ctx.app
      .makeGateway(credentials)
      .renameList(ctx.params['listId'] ?? '', body.displayName)
    return new Response(null, { status: 204 })
  },
}
