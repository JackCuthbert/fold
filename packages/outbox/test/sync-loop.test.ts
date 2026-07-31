import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FatalError, RetryableError } from '../src/errors'
import { Outbox } from '../src/outbox'
import { memoryStorage } from '../src/storage'
import { SyncLoop } from '../src/sync-loop'

interface Msg {
  id: string
}
const isMsg = (raw: unknown): raw is Msg =>
  typeof raw === 'object' &&
  raw !== null &&
  'id' in raw &&
  typeof raw.id === 'string'

const parse = (raw: unknown): Msg | null => (isMsg(raw) ? raw : null)

const flush = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0)
}

describe('SyncLoop', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('drains the queue FIFO', async () => {
    const outbox = await Outbox.open({ storage: memoryStorage(), parse })
    await outbox.enqueue({ id: '1' })
    await outbox.enqueue({ id: '2' })
    const seen: string[] = []
    const loop = new SyncLoop({
      outbox,
      process: (m) => {
        seen.push(m.id)
        return Promise.resolve()
      },
    })
    loop.start()
    await flush()
    expect(seen).toEqual(['1', '2'])
    expect(outbox.size()).toBe(0)
    loop.stop()
  })

  it('retries with exponential backoff on RetryableError', async () => {
    const outbox = await Outbox.open({ storage: memoryStorage(), parse })
    await outbox.enqueue({ id: '1' })
    const process = vi
      .fn<(m: Msg) => Promise<void>>()
      .mockRejectedValueOnce(new RetryableError('offline'))
      .mockRejectedValueOnce(new RetryableError('offline'))
      .mockResolvedValue(undefined)
    // random: () => 1 makes the jitter factor exactly 1.
    const loop = new SyncLoop({
      outbox,
      process,
      baseDelayMs: 1000,
      random: () => 1,
    })
    loop.start()
    await flush()
    expect(process).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(999)
    expect(process).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(process).toHaveBeenCalledTimes(2)

    // second retry doubles: 2000ms
    await vi.advanceTimersByTimeAsync(2000)
    expect(process).toHaveBeenCalledTimes(3)
    expect(outbox.size()).toBe(0)
    loop.stop()
  })

  it('caps the backoff at maxDelayMs', async () => {
    const outbox = await Outbox.open({ storage: memoryStorage(), parse })
    await outbox.enqueue({ id: '1' })
    const process = vi
      .fn<(m: Msg) => Promise<void>>()
      .mockRejectedValue(new RetryableError('offline'))
    const loop = new SyncLoop({
      outbox,
      process,
      baseDelayMs: 1000,
      maxDelayMs: 4000,
      random: () => 1,
    })
    loop.start()
    await flush()
    // delays: 1000, 2000, 4000, 4000 (capped), ...
    await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000 + 4000)
    expect(process).toHaveBeenCalledTimes(5)
    loop.stop()
  })

  it('drops the mutation and reports on FatalError', async () => {
    const outbox = await Outbox.open({ storage: memoryStorage(), parse })
    await outbox.enqueue({ id: 'bad' })
    await outbox.enqueue({ id: 'good' })
    const seen: string[] = []
    const onDrop = vi.fn()
    const loop = new SyncLoop({
      outbox,
      process: (m) => {
        if (m.id === 'bad') return Promise.reject(new FatalError('conflict'))
        seen.push(m.id)
        return Promise.resolve()
      },
      onDrop,
    })
    loop.start()
    await flush()
    expect(onDrop).toHaveBeenCalledWith({ id: 'bad' }, expect.any(FatalError))
    expect(seen).toEqual(['good'])
    expect(outbox.size()).toBe(0)
    loop.stop()
  })

  it('kick() retries immediately and resets the backoff', async () => {
    const outbox = await Outbox.open({ storage: memoryStorage(), parse })
    await outbox.enqueue({ id: '1' })
    const process = vi
      .fn<(m: Msg) => Promise<void>>()
      .mockRejectedValueOnce(new RetryableError('offline'))
      .mockResolvedValue(undefined)
    const loop = new SyncLoop({
      outbox,
      process,
      baseDelayMs: 60_000,
      random: () => 1,
    })
    loop.start()
    await flush()
    expect(process).toHaveBeenCalledTimes(1)
    loop.kick() // e.g. the browser 'online' event
    await flush()
    expect(process).toHaveBeenCalledTimes(2)
    expect(outbox.size()).toBe(0)
    loop.stop()
  })

  it('kick() arriving mid-process() forces an immediate retry, not a full backoff sleep', async () => {
    const outbox = await Outbox.open({ storage: memoryStorage(), parse })
    await outbox.enqueue({ id: '1' })
    // A gate we control by hand: the first `process()` call hangs until we
    // resolve `release`, letting us fire `kick()` while a drain is already
    // in flight (the #kicked lost-wakeup scenario).
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const process = vi
      .fn<(m: Msg) => Promise<void>>()
      .mockImplementationOnce(() =>
        gate.then(() => Promise.reject(new RetryableError('offline'))),
      )
      .mockResolvedValue(undefined)
    const loop = new SyncLoop({
      outbox,
      process,
      baseDelayMs: 60_000,
      random: () => 1,
    })
    loop.start()
    await flush()
    expect(process).toHaveBeenCalledTimes(1)

    // kick() arrives while the first process() call is still pending.
    loop.kick()
    release?.()
    await flush()

    // Without the #kicked guard this would instead arm a 60s backoff
    // timer and process would still show 1 call here.
    expect(process).toHaveBeenCalledTimes(2)
    expect(outbox.size()).toBe(0)
    loop.stop()
  })

  it('does not retry process() when an already-synced ack() fails to persist', async () => {
    const storage = memoryStorage()
    const outbox = await Outbox.open({
      storage,
      parse,
      onPersistError: () => {},
    })
    await outbox.enqueue({ id: '1' })
    // Make the *next* storage write (the one ack() triggers) fail, without
    // touching the write enqueue() already performed above.
    const originalSave = storage.save.bind(storage)
    let saveCalls = 0
    storage.save = (entries) => {
      saveCalls += 1
      return saveCalls === 1
        ? Promise.reject(new Error('disk full'))
        : originalSave(entries)
    }
    const process = vi
      .fn<(m: Msg) => Promise<void>>()
      .mockResolvedValue(undefined)
    const loop = new SyncLoop({ outbox, process })
    loop.start()
    await flush()
    // process() must be called exactly once: ack()'s failed write must
    // not be mistaken for a process() failure and retried.
    expect(process).toHaveBeenCalledTimes(1)
    loop.stop()
  })

  it('does not arm a retry timer if stop() is called while process() is in flight', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const outbox = await Outbox.open({ storage: memoryStorage(), parse })
    await outbox.enqueue({ id: '1' })
    const process = vi
      .fn<(m: Msg) => Promise<void>>()
      .mockImplementationOnce(() =>
        gate.then(() => Promise.reject(new RetryableError('offline'))),
      )
    const loop = new SyncLoop({ outbox, process, baseDelayMs: 1000 })
    loop.start()
    await flush()
    expect(process).toHaveBeenCalledTimes(1)

    loop.stop()
    release?.()
    await flush()

    // No dangling timer must be left armed once process() rejects after
    // stop() already ran (stop() ran too early to clear a timer that
    // didn't exist yet).
    expect(vi.getTimerCount()).toBe(0)

    // Also confirm no further attempt happens even if something did fire.
    await vi.advanceTimersByTimeAsync(10_000)
    expect(process).toHaveBeenCalledTimes(1)
  })

  it('start() after a mid-backoff stop() does not resume with stale backoff', async () => {
    const outbox = await Outbox.open({ storage: memoryStorage(), parse })
    await outbox.enqueue({ id: '1' })
    const process = vi
      .fn<(m: Msg) => Promise<void>>()
      .mockRejectedValueOnce(new RetryableError('offline'))
      .mockRejectedValueOnce(new RetryableError('offline'))
      .mockResolvedValue(undefined)
    const loop = new SyncLoop({
      outbox,
      process,
      baseDelayMs: 1000,
      random: () => 1,
    })
    loop.start()
    await flush()
    expect(process).toHaveBeenCalledTimes(1)

    // Stop mid-backoff (simulating the app being backgrounded) then start
    // again (foregrounded): the very next failure should wait the base
    // delay, not the doubled delay it would have used had #attempts
    // survived the stop/start cycle.
    loop.stop()
    loop.start()
    await flush()
    expect(process).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(999)
    expect(process).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(process).toHaveBeenCalledTimes(3)
    expect(outbox.size()).toBe(0)
    loop.stop()
  })

  // Regression: a mutation enqueued (and coalesced) while the current
  // head is still being processed must not be silently dropped once that
  // head's process() resolves and the loop acks it. This mirrors the real
  // app's coalesce rule — a delete for a todo supersedes its not-yet-synced
  // update — but the bug was general to `SyncLoop`/`Outbox`, not specific
  // to that rule: any coalesce that changes what occupies the front of the
  // queue while the old front is in flight could lose whatever coalescing
  // left there, because ack() used to remove "whatever is at index 0 now"
  // rather than the exact mutation that was actually processed.
  it('does not drop a mutation coalesced in while the head is being processed', async () => {
    interface TaggedMsg extends Msg {
      op: 'update' | 'delete'
    }
    const isTaggedMsg = (raw: unknown): raw is TaggedMsg =>
      isMsg(raw) && 'op' in raw && (raw.op === 'update' || raw.op === 'delete')
    const outbox = await Outbox.open<TaggedMsg>({
      storage: memoryStorage(),
      parse: (raw) => (isTaggedMsg(raw) ? raw : null),
      // Same shape as the app's real rule (coalesce.ts): an incoming
      // delete for an id already queued as an update supersedes it.
      coalesce: (queue, incoming) => {
        if (incoming.op !== 'delete') return [...queue, incoming]
        return [...queue.filter((m) => m.id !== incoming.id), incoming]
      },
    })
    await outbox.enqueue({ id: 'a', op: 'update' })

    let releaseUpdate: (() => void) | undefined
    const updateGate = new Promise<void>((resolve) => {
      releaseUpdate = resolve
    })
    const seen: TaggedMsg[] = []
    const loop = new SyncLoop<TaggedMsg>({
      outbox,
      process: async (m) => {
        seen.push(m)
        if (m.op === 'update') await updateGate
      },
    })
    loop.start()
    await flush()
    expect(seen).toEqual([{ id: 'a', op: 'update' }])

    // While the update is still in flight, a delete for the same id is
    // enqueued (the user completed a todo, then immediately deleted it
    // before the completion synced) — coalescing drops the queued update
    // and keeps only the delete.
    await outbox.enqueue({ id: 'a', op: 'delete' })
    expect(outbox.entries()).toEqual([{ id: 'a', op: 'delete' }])

    // The in-flight update now resolves; the loop acks it and moves on.
    releaseUpdate?.()
    await flush()

    // The delete must still be there to be processed next — not silently
    // discarded because it happened to occupy index 0 when ack() ran.
    expect(seen).toEqual([
      { id: 'a', op: 'update' },
      { id: 'a', op: 'delete' },
    ])
    expect(outbox.size()).toBe(0)
    loop.stop()
  })

  // Coalescing has two shapes that both rewrite `#queue` while a head is
  // in flight: the case above *removes* the in-flight mutation (superseded
  // by a delete), and this one *replaces* it with a new merged object in
  // place (the app's real coalesceMutations does this for two consecutive
  // updates to the same todo — apps/client/src/sync/coalesce.ts). Both
  // must leave `ack(head)` a safe no-op: `head` (the original, pre-merge
  // object) is no longer in the queue by reference either way, so
  // identity-based ack() can't tell "removed" apart from "replaced" — and
  // doesn't need to, since in both cases the right outcome is the same:
  // don't touch whatever coalescing left behind.
  it('does not drop a mutation merged in place while the head is being processed', async () => {
    interface FieldMsg extends Msg {
      value: string
    }
    const isFieldMsg = (raw: unknown): raw is FieldMsg =>
      isMsg(raw) && 'value' in raw && typeof raw.value === 'string'
    const outbox = await Outbox.open<FieldMsg>({
      storage: memoryStorage(),
      parse: (raw) => (isFieldMsg(raw) ? raw : null),
      // Same shape as coalesceMutations' updateTodo+updateTodo merge: a
      // second update to an id already queued merges into a *new* object
      // at the same position; an id not yet queued is simply appended
      // (the first enqueue in this test, with nothing yet to merge into).
      coalesce: (queue, incoming) => {
        const hasMatch = queue.some((m) => m.id === incoming.id)
        if (!hasMatch) return [...queue, incoming]
        return queue.map((m) =>
          m.id === incoming.id ? { ...m, value: incoming.value } : m,
        )
      },
    })
    await outbox.enqueue({ id: 'a', value: 'first' })

    let releaseFirst: (() => void) | undefined
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const seen: FieldMsg[] = []
    const loop = new SyncLoop<FieldMsg>({
      outbox,
      process: async (m) => {
        seen.push(m)
        if (m.value === 'first') await firstGate
      },
    })
    loop.start()
    await flush()
    expect(seen).toEqual([{ id: 'a', value: 'first' }])

    // While the first update is in flight, a second edit to the same todo
    // arrives and merges into a *new* object occupying the same position
    // — the in-flight `head` reference is no longer in the queue, but
    // nothing was dropped: it was superseded by a newer version of itself.
    await outbox.enqueue({ id: 'a', value: 'second' })
    expect(outbox.entries()).toEqual([{ id: 'a', value: 'second' }])

    releaseFirst?.()
    await flush()

    // The merged mutation must still be processed — ack() for the
    // original `head` must not remove it just because it now occupies
    // index 0.
    expect(seen).toEqual([
      { id: 'a', value: 'first' },
      { id: 'a', value: 'second' },
    ])
    expect(outbox.size()).toBe(0)
    loop.stop()
  })
})
