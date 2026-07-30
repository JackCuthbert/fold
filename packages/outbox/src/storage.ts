export interface OutboxStorage {
  load(): Promise<unknown>
  save(entries: readonly unknown[]): Promise<void>
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
