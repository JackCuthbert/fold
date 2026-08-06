import { describe, expect, it } from 'vitest'
import {
  migrateLocalStorage,
  migrateOutbox,
  type AsyncStore,
  type KeyValueStore,
} from './storage-migration'

const memoryStore = (initial: Record<string, string> = {}) => {
  const map = new Map(Object.entries(initial))
  const store: KeyValueStore = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  }
  return { store, map }
}

const dump = (map: Map<string, string>): Record<string, string> =>
  Object.fromEntries(map)

const asyncStore = (initial: Record<string, unknown[]> = {}) => {
  const map = new Map(Object.entries(initial))
  const store: AsyncStore = {
    get: (key) => Promise.resolve(map.get(key)),
    set: (key, value) => {
      map.set(key, value)
      return Promise.resolve()
    },
    del: (key) => {
      map.delete(key)
      return Promise.resolve()
    },
  }
  return { store, map }
}

// The 2026-08-01 rename moved every persisted key. Renaming without
// migrating would silently reset preferences and — far worse — discard
// unsynced mutations sitting in the outbox.
describe('migrateLocalStorage', () => {
  it('moves preferences to the new keys and clears the old ones', () => {
    const { store, map } = memoryStore({
      'caldav-todo:selected-list': 'list-1',
      'caldav-todo:nav-pinned': '0',
      'caldav-todo-muted': '1',
    })
    migrateLocalStorage(store)
    expect(dump(map)).toEqual({
      'fold:selected-list': 'list-1',
      'fold:nav-pinned': '0',
      'fold-muted': '1',
    })
  })

  it('does not clobber a value already written under the new key', () => {
    const { store } = memoryStore({
      'caldav-todo:selected-list': 'stale',
      'fold:selected-list': 'current',
    })
    migrateLocalStorage(store)
    expect(store.getItem('fold:selected-list')).toBe('current')
    expect(store.getItem('caldav-todo:selected-list')).toBeNull()
  })

  it('is a no-op once the old keys are gone, so re-running is safe', () => {
    const { store, map } = memoryStore({ 'fold:selected-list': 'list-1' })
    migrateLocalStorage(store)
    migrateLocalStorage(store)
    expect(dump(map)).toEqual({ 'fold:selected-list': 'list-1' })
  })
})

describe('migrateOutbox', () => {
  it('carries queued mutations across rather than dropping them', async () => {
    const queued = [{ id: 'm1', kind: 'createTodo' }]
    const { store, map } = asyncStore({ 'caldav-todo-outbox': queued })
    await migrateOutbox(store)
    expect(map.get('fold-outbox')).toEqual(queued)
    expect(map.has('caldav-todo-outbox')).toBe(false)
  })

  it('keeps a non-empty destination queue instead of overwriting it', async () => {
    const { store, map } = asyncStore({
      'caldav-todo-outbox': [{ id: 'old' }],
      'fold-outbox': [{ id: 'new' }],
    })
    await migrateOutbox(store)
    expect(map.get('fold-outbox')).toEqual([{ id: 'new' }])
    expect(map.has('caldav-todo-outbox')).toBe(false)
  })

  it('fills an empty destination queue from the old one', async () => {
    const { store, map } = asyncStore({
      'caldav-todo-outbox': [{ id: 'old' }],
      'fold-outbox': [],
    })
    await migrateOutbox(store)
    expect(map.get('fold-outbox')).toEqual([{ id: 'old' }])
  })

  it('leaves an already-migrated store untouched', async () => {
    const { store, map } = asyncStore({ 'fold-outbox': [{ id: 'm1' }] })
    await migrateOutbox(store)
    expect(map.get('fold-outbox')).toEqual([{ id: 'm1' }])
    expect(map.size).toBe(1)
  })
})
