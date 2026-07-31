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
    const first = outbox.peek()
    expect(first?.id).toBe('1')
    if (first) await outbox.ack(first)
    const second = outbox.peek()
    expect(second?.id).toBe('2')
    if (second) await outbox.ack(second)
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
    const mutation = { id: '1', text: 'a' }
    await expect(outbox.enqueue(mutation)).resolves.toBeUndefined()
    await expect(outbox.ack(mutation)).resolves.toBeUndefined()
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

  it('exposes a read-only snapshot of queued entries via entries()', async () => {
    const outbox = await Outbox.open({ storage: memoryStorage(), parse })
    expect(outbox.entries()).toEqual([])
    const firstMutation = { id: '1', text: 'a' }
    await outbox.enqueue(firstMutation)
    await outbox.enqueue({ id: '2', text: 'b' })
    expect(outbox.entries()).toEqual([
      { id: '1', text: 'a' },
      { id: '2', text: 'b' },
    ])
    await outbox.ack(firstMutation)
    expect(outbox.entries()).toEqual([{ id: '2', text: 'b' }])
  })

  it('notifies onChange with the queue size', async () => {
    const onChange = vi.fn()
    const outbox = await Outbox.open({
      storage: memoryStorage(),
      parse,
      onChange,
    })
    const mutation = { id: '1', text: 'a' }
    await outbox.enqueue(mutation)
    expect(onChange).toHaveBeenLastCalledWith(1)
    await outbox.ack(mutation)
    expect(onChange).toHaveBeenLastCalledWith(0)
  })

  it(
    'removes a mutation by reference even if enqueue() coalesced ' +
      'other entries around it while it was in flight',
    async () => {
      const outbox = await Outbox.open({
        storage: memoryStorage(),
        parse,
        coalesce,
      })
      const first = { id: '1', text: 'a' }
      const second = { id: '2', text: 'b' }
      await outbox.enqueue(first)
      await outbox.enqueue(second)
      // Simulate a concurrent enqueue() coalescing the head (id '1') while
      // it's still being processed elsewhere — this `coalesce` replaces any
      // entry sharing the incoming mutation's id, same as the app's real
      // rule for a delete superseding a not-yet-synced update.
      await outbox.enqueue({ id: '1', text: 'c' })
      // ack() is called with the *original* `first` reference — the one
      // that was actually processed — even though it's no longer the
      // object in the queue. It must be a safe no-op, not remove whatever
      // now happens to be at index 0 (this fixture's `coalesce` re-appends
      // a merged entry at the end, so id '1' is now last, not first).
      await outbox.ack(first)
      expect(outbox.entries()).toEqual([
        { id: '2', text: 'b' },
        { id: '1', text: 'c' },
      ])
    },
  )
})
