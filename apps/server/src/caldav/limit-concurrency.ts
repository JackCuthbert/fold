/**
 * How many CalDAV requests may be in flight at once.
 *
 * Six, because a wide burst is expensive against a server that won't hold
 * connections open. Radicale's built-in server speaks **HTTP/1.0**
 * (Python's `wsgiref.simple_server`, which never sets
 * `protocol_version`), so every request costs a fresh TCP connection and
 * a pool has nothing to reuse. Twelve concurrent requests measured
 * ~1050ms there versus 14ms against an HTTP/1.1 keep-alive server on the
 * same runtime.
 *
 * *(corrected 2026-08-04: first attributed to a Bun `fetch` pooling bug.
 * Node 24 shows the same ~1089ms, so it is not runtime-specific — the
 * pool is being denied, not failing. A production Radicale behind
 * uWSGI/Gunicorn speaks HTTP/1.1 and would not show this.)*
 *
 * Worth keeping regardless of what the server speaks: the cost is
 * per-connection, an arbitrary CalDAV server's HTTP version is not
 * something we can know, and this also bounds the fan-out inside tsdav
 * that we don't own. Sequential requests cost ~2ms each, so a queue of
 * six is nowhere near a bottleneck at any realistic list count.
 *
 * *(added 2026-08-04, issue #24.)*
 */
export const MAX_CONCURRENT_REQUESTS = 6

/**
 * Wrap an async function so at most `limit` calls run at once; the rest
 * queue in call order.
 *
 * Generic and side-effect free — it neither knows nor cares that the calls
 * are HTTP. Rejections propagate to their own caller and always release
 * the slot, so one failure can never wedge the queue.
 */
export function limitConcurrency<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  limit: number = MAX_CONCURRENT_REQUESTS,
): (...args: Args) => Promise<Result> {
  let active = 0
  const waiting: Array<() => void> = []

  const release = (): void => {
    active -= 1
    // FIFO: the longest-waiting call goes next, so a burst can't starve
    // whatever was queued first.
    const next = waiting.shift()
    if (next) next()
  }

  return async (...args: Args): Promise<Result> => {
    if (active >= limit) {
      await new Promise<void>((resolve) => waiting.push(resolve))
    }
    active += 1
    try {
      return await fn(...args)
    } finally {
      release()
    }
  }
}
