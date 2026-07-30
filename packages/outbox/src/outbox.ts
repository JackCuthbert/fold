import type { OutboxStorage } from './storage'

export interface OutboxOptions<M> {
  storage: OutboxStorage
  /** Trust boundary: validate raw stored entries (zod in the app). */
  parse: (raw: unknown) => M | null
  coalesce?: (queue: readonly M[], incoming: M) => M[]
  onChange?: (size: number) => void
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
    outbox.#queue = entries
      .map((entry) => options.parse(entry))
      .filter((entry): entry is M => entry !== null)
    return outbox
  }

  size(): number {
    return this.#queue.length
  }

  peek(): M | undefined {
    return this.#queue[0]
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
    await this.#options.storage.save(this.#queue)
    this.#options.onChange?.(this.#queue.length)
  }
}
