import { clearSessionCookie } from '../../session/cookie'
import type { Route } from '../route'

// DELETE /api/session — docs/specs/authentication.md
export const destroySession: Route = {
  method: 'DELETE',
  path: '/api/session',
  handle: () =>
    Promise.resolve(
      new Response(null, {
        status: 204,
        headers: { 'set-cookie': clearSessionCookie() },
      }),
    ),
}
