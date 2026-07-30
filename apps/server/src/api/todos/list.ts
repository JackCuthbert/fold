import { todosResponseSchema } from '@caldav-todo/schemas'
import { json, parseResponse, requireCredentials, type Route } from '../route'

// GET /api/lists/:listId/todos — docs/specs/api.md
// If-None-Match carries the client's last ctag; 304 skips the REPORT.
export const listTodos: Route = {
  method: 'GET',
  path: '/api/lists/:listId/todos',
  handle: async (ctx) => {
    const credentials = await requireCredentials(ctx)
    const gateway = ctx.app.makeGateway(credentials)
    const listId = ctx.params['listId'] ?? ''
    const knownCtag = ctx.request.headers.get('if-none-match')
    const response = knownCtag
      ? await gateway.fetchTodos(listId, knownCtag)
      : await gateway.fetchTodos(listId)
    if (response === null) return new Response(null, { status: 304 })
    return json(parseResponse(todosResponseSchema, response))
  },
}
