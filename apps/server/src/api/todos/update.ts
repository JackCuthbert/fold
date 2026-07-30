import { updateTodoRequestSchema } from '@caldav-todo/schemas'
import { CaldavError } from '../../caldav/errors'
import { json, requireCredentials, type Route } from '../route'

// PUT /api/lists/:listId/todos/:uid — docs/specs/api.md
// On upstream 412 the response carries the fresh copy so the client can
// rebase (docs/specs/sync-and-offline.md, conflict handling).
export const updateTodo: Route = {
  method: 'PUT',
  path: '/api/lists/:listId/todos/:uid',
  handle: async (ctx) => {
    const credentials = await requireCredentials(ctx)
    const body = updateTodoRequestSchema.parse(await ctx.request.json())
    const gateway = ctx.app.makeGateway(credentials)
    const listId = ctx.params['listId'] ?? ''
    const uid = ctx.params['uid'] ?? ''
    try {
      const todo = await gateway.updateTodo(
        listId,
        uid,
        body.etag,
        body.changes,
      )
      return json(todo)
    } catch (error) {
      if (error instanceof CaldavError && error.status === 412) {
        const fresh = await gateway.fetchTodo(listId, uid)
        return json({ todo: fresh }, 412)
      }
      throw error
    }
  },
}
