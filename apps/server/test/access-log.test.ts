import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createRouter } from '../src/api/router'
import { json, type Route } from '../src/api/route'
import { CaldavUnreachableError } from '../src/caldav/errors'
import { HttpError } from '../src/http/errors'
import { formatAccessLog, outcomeFor } from '../src/observability/access-log'
import { testApp } from './helpers/test-app'

// A secret and a password that would be unmistakable if they ever reached
// a log line. Every assertion below searches the *whole* emitted line for
// these, rather than checking named fields — a future field that leaked one
// would be caught without the test having to know the field exists.
const SECRET_LIST_ID = 'super-secret-list-id-9f3a'
const SECRET_PASSWORD = 'hunter2-the-users-caldav-password'

/** The exact shape a log line is allowed to have. Parsing through this
 *  rather than asserting a type also pins the *absence* of extra fields —
 *  see the strict() below. */
const entrySchema = z
  .object({
    msg: z.literal('request'),
    method: z.string(),
    route: z.string().nullable(),
    status: z.number(),
    outcome: z.enum(['ok', 'client', 'fail', 'upstream']),
    durationMs: z.number(),
  })
  .strict()

const routes: Route[] = [
  {
    method: 'GET',
    path: '/api/lists/:listId',
    handle: (ctx) => Promise.resolve(json({ id: ctx.params['listId'] })),
  },
  {
    method: 'POST',
    path: '/api/session',
    handle: async (ctx) => {
      await ctx.request.json()
      return json({ ok: true })
    },
  },
  {
    method: 'GET',
    path: '/api/boom',
    handle: () => Promise.reject(new HttpError(403, 'nope', 'Nope')),
  },
  {
    method: 'GET',
    path: '/api/down',
    handle: () => Promise.reject(new CaldavUnreachableError('down')),
  },
]

/** Collect log lines instead of writing them to stdout. */
function withCapture() {
  const lines: string[] = []
  const handle = createRouter(routes, testApp(), {
    logSink: (line) => lines.push(line),
  })
  return { lines, handle }
}

describe('access log', () => {
  it('records the route pattern, not the concrete path', async () => {
    const { lines, handle } = withCapture()
    await handle(new Request(`http://localhost/api/lists/${SECRET_LIST_ID}`))

    const entry: unknown = JSON.parse(lines[0] ?? '{}')
    expect(entry).toMatchObject({
      method: 'GET',
      route: '/api/lists/:listId',
      status: 200,
      outcome: 'ok',
    })
    // The point of logging the pattern: the id never appears.
    expect(lines[0]).not.toContain(SECRET_LIST_ID)
  })

  it('never logs a request body, even on the sign-in route', async () => {
    const { lines, handle } = withCapture()
    await handle(
      new Request('http://localhost/api/session', {
        method: 'POST',
        body: JSON.stringify({
          username: 'jack@example.com',
          password: SECRET_PASSWORD,
          serverUrl: 'https://caldav.personal-domain.example/dav/',
        }),
        headers: { 'content-type': 'application/json' },
      }),
    )

    expect(lines[0]).not.toContain(SECRET_PASSWORD)
    expect(lines[0]).not.toContain('jack@example.com')
    expect(lines[0]).not.toContain('personal-domain.example')
  })

  it('never logs cookies or authorization headers', async () => {
    const { lines, handle } = withCapture()
    await handle(
      new Request(`http://localhost/api/lists/${SECRET_LIST_ID}`, {
        headers: {
          cookie: `fold_session=${SECRET_PASSWORD}`,
          authorization: `Basic ${SECRET_PASSWORD}`,
          'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)',
          'x-forwarded-for': '203.0.113.42',
        },
      }),
    )

    expect(lines[0]).not.toContain(SECRET_PASSWORD)
    expect(lines[0]).not.toContain('203.0.113.42')
    expect(lines[0]).not.toContain('iPhone')
  })

  it('logs an unmatched route as null rather than the raw path', async () => {
    const { lines, handle } = withCapture()
    await handle(new Request(`http://localhost/api/nope/${SECRET_LIST_ID}`))

    expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({
      route: null,
      status: 404,
      outcome: 'client',
    })
    expect(lines[0]).not.toContain(SECRET_LIST_ID)
  })

  it('logs one line per request, with a duration', async () => {
    const { lines, handle } = withCapture()
    await handle(new Request('http://localhost/api/lists/abc'))
    await handle(new Request('http://localhost/api/lists/def'))

    expect(lines).toHaveLength(2)
    // Parsed through the schema the log claims to emit, rather than
    // asserted into shape — the same "validate at the boundary" rule the
    // server itself follows (CLAUDE.md).
    const durations = lines.map(
      (line) => entrySchema.parse(JSON.parse(line)).durationMs,
    )
    for (const durationMs of durations) {
      expect(durationMs).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(durationMs)).toBe(true)
    }
  })

  it('separates our failures from the upstream CalDAV server’s', async () => {
    const { lines, handle } = withCapture()
    await handle(new Request('http://localhost/api/boom'))
    await handle(new Request('http://localhost/api/down'))

    expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({
      status: 403,
      outcome: 'client',
    })
    // 502 is the CalDAV server failing, not this server — a different
    // operational event, so it gets its own outcome.
    expect(JSON.parse(lines[1] ?? '{}')).toMatchObject({
      status: 502,
      outcome: 'upstream',
    })
  })

  it('classifies a 500 as our own failure', () => {
    expect(outcomeFor(500)).toBe('fail')
    expect(outcomeFor(502)).toBe('upstream')
    expect(outcomeFor(404)).toBe('client')
    expect(outcomeFor(200)).toBe('ok')
    expect(outcomeFor(302)).toBe('ok')
  })

  // The backstop for every assertion above: they can only catch a leak
  // through a value they know to look for. This catches a *new field*
  // appearing at all, so adding one to the log has to be deliberate enough
  // to update this list — which is the moment to ask whether it is
  // personal data (docs/specs/observability.md).
  it('emits no fields beyond the declared set', async () => {
    const { lines, handle } = withCapture()
    await handle(new Request(`http://localhost/api/lists/${SECRET_LIST_ID}`))

    expect(() => entrySchema.parse(JSON.parse(lines[0] ?? '{}'))).not.toThrow()
  })

  it('emits one line of parseable JSON', () => {
    const line = formatAccessLog({
      method: 'GET',
      route: '/api/lists',
      status: 200,
      outcome: 'ok',
      durationMs: 12,
    })
    expect(line).not.toContain('\n')
    expect(JSON.parse(line)).toEqual({
      msg: 'request',
      method: 'GET',
      route: '/api/lists',
      status: 200,
      outcome: 'ok',
      durationMs: 12,
    })
  })
})
