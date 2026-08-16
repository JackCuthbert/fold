import {
  conflictResponseSchema,
  createTodoRequestSchema,
  todoSchema,
} from '@fold/schemas'
import { CaldavError } from '../../caldav/errors'
import { json, parseResponse, requireCredentials, type Route } from '../route'

// POST /api/lists/:listId/todos — docs/specs/api.md
export const createTodo: Route = {
  method: 'POST',
  path: '/api/lists/:listId/todos',
  handle: async (ctx) => {
    const credentials = await requireCredentials(ctx)
    const body = createTodoRequestSchema.parse(await ctx.request.json())
    const gateway = ctx.app.makeGateway(credentials)
    const listId = ctx.params['listId'] ?? ''
    try {
      const todo = await gateway.createTodo(listId, body)
      return json(parseResponse(todoSchema, todo), 201)
    } catch (error) {
      // A retried create (the outbox resending an unacked mutation whose
      // first attempt actually landed) surfaces as 412 here: the resource
      // already exists. Report it like other conflicts so the client can
      // tell "already created" apart from a genuine failure
      // (docs/specs/sync-and-offline.md — outbox retries).
      if (error instanceof CaldavError && error.status === 412) {
        const fresh = await gateway.fetchTodo(listId, body.uid)
        return json(parseResponse(conflictResponseSchema, { todo: fresh }), 412)
      }
      throw error
    }
  },
}
