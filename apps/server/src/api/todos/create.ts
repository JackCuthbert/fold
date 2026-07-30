import { createTodoRequestSchema } from '@caldav-todo/schemas'
import { json, requireCredentials, type Route } from '../route'

// POST /api/lists/:listId/todos — docs/specs/api.md
export const createTodo: Route = {
  method: 'POST',
  path: '/api/lists/:listId/todos',
  handle: async (ctx) => {
    const credentials = await requireCredentials(ctx)
    const body = createTodoRequestSchema.parse(await ctx.request.json())
    const todo = await ctx.app
      .makeGateway(credentials)
      .createTodo(ctx.params['listId'] ?? '', body)
    return json(todo, 201)
  },
}
