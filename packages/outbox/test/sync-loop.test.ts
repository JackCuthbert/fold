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
})
