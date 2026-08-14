import { credentialsSchema } from '@fold/schemas'
import { z } from 'zod'
import {
  FAULT_OPERATIONS,
  FakeCaldavStore,
  fakeStore,
  seedListSchema,
} from '../../caldav/fake-gateway'
import { json, type Route } from '../route'

/**
 * The e2e suite's control channel for the fake CalDAV gateway.
 *
 * **Only registered when `CALDAV_FAKE` is on** — see `resolveGateway` in
 * index.ts, which is where this route enters the table, and config.ts,
 * which refuses that flag under `NODE_ENV=production` and refuses it
 * anywhere without an explicit `CALDAV_FAKE_CONFIRM`. So this route does
 * not exist in a real deployment — which matters, because it deliberately
 * takes credentials in its body rather than reading a session cookie.
 *
 * That shape is not laziness. Playwright talks to the app server over
 * HTTP, and seeding has to happen *before* the browser signs in — there is
 * no session to read yet. Sessions are sealed and lists/todos are
 * per-account (docs/specs/testing.md — one CalDAV account per test), so
 * the account to seed has to be named explicitly, and the credentials the
 * test is about to sign in with are exactly that name.
 *
 * *(added 2026-08-14, issue #54.)*
 */

/**
 * A staged fault, as a spec describes it.
 *
 * `status: 0` means "could not reach the server at all", which the gateway
 * turns into `CaldavUnreachableError` and the router maps to the 502 the
 * client reads as "keep the queue" (api/router.ts — error mapping).
 */
const faultSchema = z.object({
  operations: z.array(z.enum(FAULT_OPERATIONS)).min(1),
  status: z.int().min(0).max(599).optional(),
  delayMs: z.int().min(0).optional(),
  /** Defaults to a single call, which is the common case. */
  count: z.int().min(1).default(1),
})

const requestSchema = z.object({
  credentials: credentialsSchema,
  /** Replaces the account's contents outright. Omit to leave them alone. */
  lists: z.array(seedListSchema).optional(),
  faults: z.array(faultSchema).optional(),
  /** Wipe the account first — the "start from known state" case. */
  reset: z.boolean().default(false),
  /**
   * Drop every staged fault without touching the data — "the server is
   * back". Lets a spec end an outage on demand rather than tuning a fault
   * count against the outbox's retry schedule.
   */
  clearFaults: z.boolean().default(false),
})

// POST /api/testing/fake — docs/specs/testing.md (the two e2e modes).
export const fakeAdmin: Route = {
  method: 'POST',
  path: '/api/testing/fake',
  handle: async (ctx) => {
    const body = requestSchema.parse(await ctx.request.json())
    const key = FakeCaldavStore.keyFor(body.credentials)
    if (body.reset) fakeStore.reset(key)
    if (body.clearFaults) fakeStore.clearFaults(key)
    if (body.lists) fakeStore.seed(key, body.lists)
    for (const fault of body.faults ?? []) {
      fakeStore.stageFault(key, {
        operations: fault.operations,
        remaining: fault.count,
        ...(fault.status !== undefined ? { status: fault.status } : {}),
        ...(fault.delayMs !== undefined ? { delayMs: fault.delayMs } : {}),
      })
    }
    return json({ ok: true })
  },
}
