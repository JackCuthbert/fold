import { requireCredentials, type Route } from '../route'

// DELETE /api/lists/:listId — docs/specs/lists.md
export const removeList: Route = {
  method: 'DELETE',
  path: '/api/lists/:listId',
  handle: async (ctx) => {
    const credentials = await requireCredentials(ctx)
    await ctx.app
      .makeGateway(credentials)
      .deleteList(ctx.params['listId'] ?? '')
    return new Response(null, { status: 204 })
  },
}
