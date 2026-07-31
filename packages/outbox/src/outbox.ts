import type { OutboxStorage } from './storage'

export interface OutboxOptions<M> {
  storage: OutboxStorage
  /** Trust boundary: validate raw stored entries (zod in the app). */
  parse: (raw: unknown) => M | null
  coalesce?: (queue: readonly M[], incoming: M) => M[]
  onChange?: (size: number) => void
  /**
   * Called with the raw entries `parse` rejected on `open()`, if any.
   * Loading always keeps going with the entries that did parse — this is
   * purely so a schema-migration bug that silently eats queued work is
   * observable instead of leaving zero trace.
   */
  onDropOnLoad?: (raw: readonly unknown[]) => void
  /**
   * Called when `storage.save()` rejects. The in-memory queue has already
   * been updated, so memory and disk have diverged — the caller decides
   * whether to retry the write or surface it to the user.
   */
  onPersistError?: (error: unknown) => void
}

export class Outbox<M> {
  #options: OutboxOptions<M>
  #queue: readonly M[] = []

  private constructor(options: OutboxOptions<M>) {
    this.#options = options
  }

  static async open<M>(options: OutboxOptions<M>): Promise<Outbox<M>> {
    const outbox = new Outbox(options)
    const raw = await options.storage.load()
    const entries = Array.isArray(raw) ? raw : []
    const dropped: unknown[] = []
    outbox.#queue = entries.flatMap((entry) => {
      const parsed = options.parse(entry)
      if (parsed === null) {
        dropped.push(entry)
        return []
      }
      return [parsed]
    })
    if (dropped.length > 0) {
      options.onDropOnLoad?.(dropped)
    }
    return outbox
  }

  size(): number {
    return this.#queue.length
  }

  peek(): M | undefined {
    return this.#queue[0]
  }

  /** Read-only snapshot of every queued entry, FIFO order. */
  entries(): readonly M[] {
    return this.#queue
  }

  async enqueue(mutation: M): Promise<void> {
    this.#queue = this.#options.coalesce
      ? this.#options.coalesce(this.#queue, mutation)
      : [...this.#queue, mutation]
    await this.#persist()
  }

  async ack(): Promise<void> {
    this.#queue = this.#queue.slice(1)
    await this.#persist()
  }

  async #persist(): Promise<void> {
    try {
      await this.#options.storage.save(this.#queue)
    } catch (error) {
      this.#options.onPersistError?.(error)
      return
    }
    this.#options.onChange?.(this.#queue.length)
  }
}
