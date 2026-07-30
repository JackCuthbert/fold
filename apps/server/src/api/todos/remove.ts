import { deleteTodoRequestSchema } from '@caldav-todo/schemas'
import { CaldavError } from '../../caldav/errors'
import { json, requireCredentials, type Route } from '../route'

// DELETE /api/lists/:listId/todos/:uid — docs/specs/api.md
export const removeTodo: Route = {
  method: 'DELETE',
  path: '/api/lists/:listId/todos/:uid',
  handle: async (ctx) => {
    const credentials = await requireCredentials(ctx)
    const body = deleteTodoRequestSchema.parse(await ctx.request.json())
    const gateway = ctx.app.makeGateway(credentials)
    const listId = ctx.params['listId'] ?? ''
    const uid = ctx.params['uid'] ?? ''
    try {
      await gateway.deleteTodo(listId, uid, body.etag)
      return new Response(null, { status: 204 })
    } catch (error) {
      if (error instanceof CaldavError && error.status === 412) {
        const fresh = await gateway.fetchTodo(listId, uid)
        return json({ todo: fresh }, 412)
      }
      throw error
    }
  },
}
