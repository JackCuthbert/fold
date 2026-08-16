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

  /**
   * Remove the mutation that was just successfully processed — pass back
   * exactly the object `peek()` returned before processing it.
   *
   * Takes the mutation itself, not just "the current head": `process()`
   * for the head is awaited by the caller, and `enqueue()` can run
   * concurrently while that await is in flight (a UI action queues a new
   * mutation while the previous one is still processing). `coalesce` can
   * rewrite the in-flight mutation's spot in `#queue` in two different
   * shapes — both handled the same way here:
   *   - **Drop**: an incoming mutation supersedes it outright (e.g. a
   *     delete arriving for a todo whose update hasn't synced yet
   *     reasonably discards that update, since deleting supersedes it).
   *   - **Replace**: an incoming mutation merges into a *new* object at
   *     the same position (e.g. two consecutive edits to the same todo
   *     coalesce into one update). The original object reference is gone
   *     from the queue either way, even though nothing was "dropped" in
   *     the replace case — it was superseded by a newer version of
   *     itself.
   * An index-based `slice(1)` would remove whatever coalescing left at
   * the front instead of the mutation this call actually finished,
   * silently discarding the caller's newer mutation (dropped case) or
   * the merged replacement (replace case) instead of the one that was
   * really acked. Removing by reference identity instead means: if the
   * processed mutation is still in the queue, drop that one wherever it
   * is; if coalescing already moved past it — dropped or replaced — ack()
   * is a no-op, and whatever coalescing left behind (nothing, or the
   * merged replacement) stays queued untouched. This class doesn't need
   * to distinguish the two cases to be correct; it only needs to never
   * touch anything but the exact instance it was told was done.
   */
  async ack(mutation: M): Promise<void> {
    const index = this.#queue.indexOf(mutation)
    if (index === -1) {
      // Already coalesced away (dropped or replaced) by a concurrent
      // enqueue() — nothing to remove, and nothing was lost: whatever
      // coalescing left behind is still queued and will be processed in
      // its turn.
      return
    }
    this.#queue = [
      ...this.#queue.slice(0, index),
      ...this.#queue.slice(index + 1),
    ]
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
