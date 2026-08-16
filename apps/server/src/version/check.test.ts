import { describe, expect, it, vi } from 'vitest'
import { makeUpdateChecker } from './check'

const ok = (tag: string) =>
  new Response(JSON.stringify({ tag_name: tag }), { status: 200 })

describe('makeUpdateChecker', () => {
  // The property that matters most: a deployment that has not opted in
  // makes no outbound request at all (docs/specs/releases.md).
  it('makes no network call when disabled', async () => {
    const fetchImpl = vi.fn()
    const check = makeUpdateChecker({
      enabled: false,
      fetchImpl,
    })

    expect(await check('0.2.0')).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('reports a newer release', async () => {
    const check = makeUpdateChecker({
      enabled: true,
      fetchImpl: () => Promise.resolve(ok('v0.3.0')),
    })

    expect(await check('0.2.0')).toBe('v0.3.0')
  })

  it('says nothing when the running version is current or ahead', async () => {
    const check = makeUpdateChecker({
      enabled: true,
      fetchImpl: () => Promise.resolve(ok('v0.2.0')),
    })

    expect(await check('0.2.0')).toBeNull()
    // Running ahead of the last release — a build from main.
    expect(await check('0.4.0')).toBeNull()
  })

  // One call a day per deployment, not one per request.
  it('caches, then refetches once the window passes', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(ok('v0.3.0')))
    let clock = 0
    const check = makeUpdateChecker({
      enabled: true,
      fetchImpl,
      now: () => clock,
      cacheMs: 1000,
    })

    await check('0.2.0')
    await check('0.2.0')
    await check('0.2.0')
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    clock = 1001
    await check('0.2.0')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  // Every failure is the same event to the user: nothing to say. None of
  // these may throw, because the caller renders a page either way.
  it('degrades to null on any failure', async () => {
    const failures: Array<() => Promise<Response>> = [
      () => Promise.reject(new Error('offline')),
      () => Promise.resolve(new Response('', { status: 403 })), // rate limited
      () => Promise.resolve(new Response('not json', { status: 200 })),
      () => Promise.resolve(new Response(JSON.stringify({}), { status: 200 })),
      () =>
        Promise.resolve(
          new Response(JSON.stringify({ tag_name: 42 }), { status: 200 }),
        ),
    ]

    for (const [index, fetchImpl] of failures.entries()) {
      const check = makeUpdateChecker({
        enabled: true,
        fetchImpl,
      })
      await expect(check('0.2.0'), `failure ${index}`).resolves.toBeNull()
    }
  })
})
