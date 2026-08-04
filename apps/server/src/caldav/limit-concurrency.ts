/**
 * How many CalDAV requests may be in flight at once.
 *
 * Six, because Bun's `fetch` stalls hard above roughly seven concurrent
 * requests to one host: measured against a local Radicale, seven
 * concurrent PROPFINDs completed in 11ms and eight took 1068ms — a clean
 * step, not a curve, with a ~1000ms penalty that looks like a pool limit
 * plus a retry timer. The same eight requests issued by `curl` took 44ms,
 * so it is the client, not the server.
 *
 * The effect is dramatic because tsdav's calendar discovery issues one
 * PROPFIND *per collection*: with 20 lists, one `fetchLists` fires 23
 * requests at once and pays the stall every time. Batching the identical
 * work six at a time took it from 1042ms to 49ms.
 *
 * Six rather than seven to leave headroom — the ceiling is empirical, and
 * a Bun upgrade could move it. Sequential requests cost ~2ms each, so a
 * queue of six is nowhere near a bottleneck at any realistic list count.
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
