import { patchListRequestSchema } from '@fold/schemas'
import { requireCredentials, type Route } from '../route'

// PATCH /api/lists/:listId — docs/specs/lists.md
//
// Carries any subset of a list's mutable properties. The name lives in
// `displayname` (RFC 4791) while colour and order live in Apple extension
// properties, so they are two different CalDAV requests — but one API call,
// because to the user they are one edit.
export const patchList: Route = {
  method: 'PATCH',
  path: '/api/lists/:listId',
  handle: async (ctx) => {
    const credentials = await requireCredentials(ctx)
    const body = patchListRequestSchema.parse(await ctx.request.json())
    const listId = ctx.params['listId'] ?? ''
    const gateway = ctx.app.makeGateway(credentials)

    if (body.displayName !== undefined) {
      await gateway.renameList(listId, body.displayName)
    }
    if (body.color !== undefined || body.order !== undefined) {
      await gateway.setListProps(listId, {
        ...(body.color !== undefined ? { color: body.color } : {}),
        ...(body.order !== undefined ? { order: body.order } : {}),
      })
    }
    return new Response(null, { status: 204 })
  },
}
