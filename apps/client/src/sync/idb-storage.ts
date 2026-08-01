import type { OutboxStorage } from '@fold/outbox'
import { get, set } from 'idb-keyval'

export function idbStorage(key = 'fold-outbox'): OutboxStorage {
  return {
    load: async () => (await get<unknown[]>(key)) ?? [],
    save: (entries) => set(key, [...entries]),
  }
}
