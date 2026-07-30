import type { OutboxStorage } from '@caldav-todo/outbox'
import { get, set } from 'idb-keyval'

export function idbStorage(key = 'caldav-todo-outbox'): OutboxStorage {
  return {
    load: async () => (await get<unknown[]>(key)) ?? [],
    save: (entries) => set(key, [...entries]),
  }
}
