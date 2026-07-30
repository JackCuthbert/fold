import { describe, expect, it, vi } from 'vitest'
import { Outbox } from '../src/outbox'
import { memoryStorage } from '../src/storage'

interface Msg {
  id: string
  text: string
}

const isMsg = (raw: unknown): raw is Msg =>
  typeof raw === 'object' &&
  raw !== null &&
  'id' in raw &&
  'text' in raw &&
  typeof raw.id === 'string' &&
  typeof raw.text === 'string'

const parse = (raw: unknown): Msg | null => (isMsg(raw) ? raw : null)

const coalesce = (queue: readonly Msg[], incoming: Msg): Msg[] => [
  ...queue.filter((m) => m.id !== incoming.id),
  incoming,
]

describe('Outbox', () => {
  it('enqueues and drains FIFO', async () => {
    const outbox = await Outbox.open({ storage: memoryStorage(), parse })
    await outbox.enqueue({ id: '1', text: 'a' })
    await outbox.enqueue({ id: '2', text: 'b' })
    expect(outbox.peek()?.id).toBe('1')
    await outbox.ack()
    expect(outbox.peek()?.id).toBe('2')
    await outbox.ack()
    expect(outbox.size()).toBe(0)
  })

  it('survives a restart over the same storage', async () => {
    const storage = memoryStorage()
    const first = await Outbox.open({ storage, parse })
    await first.enqueue({ id: '1', text: 'a' })
    await first.enqueue({ id: '2', text: 'b' })

    const second = await Outbox.open({ storage, parse })
    expect(second.size()).toBe(2)
    expect(second.peek()?.id).toBe('1')
  })

  it('drops entries the parser rejects on load', async () => {
    const storage = memoryStorage()
    await storage.save([{ id: '1', text: 'ok' }, { corrupt: true }, 42])
    const outbox = await Outbox.open({ storage, parse })
    expect(outbox.size()).toBe(1)
  })

  it('reports dropped entries via onDropOnLoad', async () => {
    const storage = memoryStorage()
    const corrupt = { corrupt: true }
    await storage.save([{ id: '1', text: 'ok' }, corrupt, 42])
    const onDropOnLoad = vi.fn()
    await Outbox.open({ storage, parse, onDropOnLoad })
    expect(onDropOnLoad).toHaveBeenCalledWith([corrupt, 42])
  })

  it('does not call onDropOnLoad when nothing is dropped', async () => {
    const storage = memoryStorage()
    await storage.save([{ id: '1', text: 'ok' }])
    const onDropOnLoad = vi.fn()
    await Outbox.open({ storage, parse, onDropOnLoad })
    expect(onDropOnLoad).not.toHaveBeenCalled()
  })

  it('reports storage.save() rejections via onPersistError', async () => {
    const storage = memoryStorage()
    const failure = new Error('disk full')
    const save = vi.fn().mockRejectedValue(failure)
    const onPersistError = vi.fn()
    const outbox = await Outbox.open({
      storage: { load: () => storage.load(), save },
      parse,
      onPersistError,
    })
    await outbox.enqueue({ id: '1', text: 'a' })
    expect(onPersistError).toHaveBeenCalledWith(failure)
    // The in-memory queue still reflects the mutation even though the
    // write failed — the caller decides whether to retry or surface it.
    expect(outbox.size()).toBe(1)
  })

  it('does not throw from enqueue/ack when persistence fails', async () => {
    const save = vi.fn().mockRejectedValue(new Error('disk full'))
    const outbox = await Outbox.open({
      storage: { load: () => Promise.resolve([]), save },
      parse,
      onPersistError: () => {},
    })
    await expect(
      outbox.enqueue({ id: '1', text: 'a' }),
    ).resolves.toBeUndefined()
    await expect(outbox.ack()).resolves.toBeUndefined()
  })

  it('applies the coalesce hook on enqueue', async () => {
    const outbox = await Outbox.open({
      storage: memoryStorage(),
      parse,
      coalesce,
    })
    await outbox.enqueue({ id: '1', text: 'a' })
    await outbox.enqueue({ id: '1', text: 'b' })
    expect(outbox.size()).toBe(1)
    expect(outbox.peek()?.text).toBe('b')
  })

  it('notifies onChange with the queue size', async () => {
    const onChange = vi.fn()
    const outbox = await Outbox.open({
      storage: memoryStorage(),
      parse,
      onChange,
    })
    await outbox.enqueue({ id: '1', text: 'a' })
    expect(onChange).toHaveBeenLastCalledWith(1)
    await outbox.ack()
    expect(onChange).toHaveBeenLastCalledWith(0)
  })
})
