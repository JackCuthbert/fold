import type { Credentials } from '@fold/schemas'
import type { ZodType } from 'zod'
import type { GatewayFactory } from '../caldav/gateway'
import type { Config } from '../config'
import { HttpError } from '../http/errors'
import { readSession } from '../session/cookie'

export interface AppContext {
  config: Config
  makeGateway: GatewayFactory
}

export interface RequestContext {
  request: Request
  params: Record<string, string>
  app: AppContext
}

export interface Route {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  handle: (ctx: RequestContext) => Promise<Response>
}

/** Match `/api/lists/:listId` style paths. Returns params or null. */
export function matchPath(
  pattern: string,
  pathname: string,
): Record<string, string> | null {
  const patternParts = pattern.split('/')
  const pathParts = pathname.split('/')
  if (patternParts.length !== pathParts.length) return null
  const params: Record<string, string> = {}
  for (const [index, part] of patternParts.entries()) {
    const actual = pathParts[index] ?? ''
    if (part.startsWith(':')) {
      if (actual === '') return null
      params[part.slice(1)] = decodeURIComponent(actual)
    } else if (part !== actual) {
      return null
    }
  }
  return params
}

export async function requireCredentials(
  ctx: RequestContext,
): Promise<Credentials> {
  const credentials = await readSession(
    ctx.request,
    ctx.app.config.SESSION_SECRET,
  )
  if (!credentials) throw new HttpError(401, 'unauthorized', 'Not signed in')
  return credentials
}

export const json = (
  body: unknown,
  status = 200,
  headers?: Record<string, string>,
) => Response.json(body, { status, ...(headers ? { headers } : {}) })

/**
 * Validate data the gateway returned before it goes out over the wire —
 * zod at every trust boundary applies to API output as much as input
 * (CLAUDE.md). A failure here means our own gateway produced a value its
 * own schema forbids: that is a server bug, not a bad client request, so
 * it is surfaced as 500 rather than reusing the 400 `invalid_request`
 * path reserved for request-body validation.
 */
export function parseResponse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new HttpError(
      500,
      'internal',
      `response failed schema validation: ${result.error.message}`,
    )
  }
  return result.data
}
