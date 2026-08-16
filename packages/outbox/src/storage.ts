export interface OutboxStorage {
  load(): Promise<unknown>
  save(entries: readonly unknown[]): Promise<void>
}

/**
 * Storage for when the real one could not be read.
 *
 * Loads as empty so the caller can start, and **refuses every write**.
 *
 * The refusal is the point. When a durable queue can't be read — an
 * IndexedDB that hangs rather than fails, say — the entries are still
 * there, unread. Falling back to an ordinary empty store would let the
 * next save overwrite them with the empty queue, turning "temporarily
 * unreadable" into "permanently destroyed". Failing every write instead
 * keeps the on-disk queue intact and, because the rejection reaches
 * `onPersistError`, keeps the failure visible rather than silent.
 */
export function unreadableStorage(): OutboxStorage {
  return {
    load: () => Promise.resolve([]),
    save: () =>
      Promise.reject(
        new Error(
          'refusing to write: the queue on disk could not be read, and ' +
            'overwriting it would destroy queued work',
        ),
      ),
  }
}

export function memoryStorage(): OutboxStorage {
  let data: readonly unknown[] = []
  return {
    load: () => Promise.resolve([...data]),
    save: (entries) => {
      data = [...entries]
      return Promise.resolve()
    },
  }
}
