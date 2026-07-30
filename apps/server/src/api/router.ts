import { ZodError } from 'zod'
import { CaldavError, CaldavUnreachableError } from '../caldav/errors'
import { HttpError } from '../http/errors'
import { json, matchPath, type AppContext, type Route } from './route'

// Error mapping per docs/specs/api.md.
function toResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return json({ error: error.code, message: error.message }, error.status)
  }
  if (error instanceof ZodError) {
    return json({ error: 'invalid_request', message: error.message }, 400)
  }
  if (error instanceof CaldavError) {
    if (error.status === 401) {
      return json({ error: 'unauthorized', message: error.message }, 401)
    }
    if (error.status === 412) {
      return json({ error: 'conflict', message: error.message }, 412)
    }
    return json({ error: 'caldav_error', message: error.message }, 502)
  }
  if (error instanceof CaldavUnreachableError) {
    return json(
      { error: 'caldav_unreachable', message: 'CalDAV server unreachable' },
      502,
    )
  }
  console.error('unhandled error', error)
  return json({ error: 'internal', message: 'Internal server error' }, 500)
}

export function createRouter(routes: Route[], app: AppContext) {
  return async (request: Request): Promise<Response> => {
    const { pathname } = new URL(request.url)
    for (const route of routes) {
      if (route.method !== request.method) continue
      const params = matchPath(route.path, pathname)
      if (!params) continue
      try {
        return await route.handle({ request, params, app })
      } catch (error) {
        return toResponse(error)
      }
    }
    return json({ error: 'not_found', message: 'No such route' }, 404)
  }
}
