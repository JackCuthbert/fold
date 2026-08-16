import { describe, expect, it, vi } from 'vitest'
import { Outbox } from '../src/outbox'
import { unreadableStorage } from '../src/storage'

// A storage whose `load()` never settled left the app unable to mount at
// all (issue #17). Giving up and falling back to an empty writable store
// would be worse than the hang: the queued mutations are still on disk,
// unread, and the first `save()` would overwrite them with the empty
// queue — turning "temporarily unreadable" into "permanently destroyed".
describe('unreadableStorage', () => {
  it('loads as empty so the caller can carry on', async () => {
    await expect(unreadableStorage().load()).resolves.toEqual([])
  })

  // The whole point: never write over what we failed to read.
  it('refuses to save rather than overwriting the unread queue', async () => {
    await expect(unreadableStorage().save([{ id: 'a' }])).rejects.toThrow()
  })

  it('keeps refusing on every attempt, not just the first', async () => {
    const storage = unreadableStorage()
    await expect(storage.save([])).rejects.toThrow()
    await expect(storage.save([{ id: 'b' }])).rejects.toThrow()
  })
})

describe('an Outbox on unreadable storage', () => {
  it('opens, so the app can mount', async () => {
    const outbox = await Outbox.open({
      storage: unreadableStorage(),
      parse: (raw) => raw,
    })
    expect(outbox.size()).toBe(0)
  })

  // The user must be told: their change is live in this tab but is not
  // written down, so a reload loses it. Silence would look like success.
  it('reports every failed write instead of swallowing it', async () => {
    const onPersistError = vi.fn()
    const outbox = await Outbox.open<{ id: string }>({
      storage: unreadableStorage(),
      // Never called: `unreadableStorage` always loads empty.
      parse: () => null,
      onPersistError,
    })
    await outbox.enqueue({ id: 'a' })
    expect(onPersistError).toHaveBeenCalledTimes(1)
    await outbox.enqueue({ id: 'b' })
    expect(onPersistError).toHaveBeenCalledTimes(2)
  })

  // Refusing to persist must not make the queue useless in this session —
  // the sync loop still drains it to the server, which is what actually
  // saves the user's work.
  it('still queues in memory so the sync loop can drain it', async () => {
    const outbox = await Outbox.open<{ id: string }>({
      storage: unreadableStorage(),
      // Never called: `unreadableStorage` always loads empty.
      parse: () => null,
      onPersistError: () => {},
    })
    await outbox.enqueue({ id: 'a' })
    await outbox.enqueue({ id: 'b' })
    expect(outbox.size()).toBe(2)
    expect(outbox.peek()).toEqual({ id: 'a' })
  })
})
