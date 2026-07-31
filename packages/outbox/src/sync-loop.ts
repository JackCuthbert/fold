import { FatalError } from './errors'
import type { Outbox } from './outbox'

export interface SyncLoopOptions<M> {
  outbox: Outbox<M>
  process: (mutation: M) => Promise<void>
  onDrop?: (mutation: M, error: FatalError) => void
  baseDelayMs?: number
  maxDelayMs?: number
  /** Injectable for deterministic tests. */
  random?: () => number
}

export class SyncLoop<M> {
  #options: Required<Pick<SyncLoopOptions<M>, 'baseDelayMs' | 'maxDelayMs'>> &
    SyncLoopOptions<M>
  #attempts = 0
  #timer: ReturnType<typeof setTimeout> | undefined
  #running = false
  #draining = false
  #kicked = false

  constructor(options: SyncLoopOptions<M>) {
    this.#options = {
      baseDelayMs: 1000,
      maxDelayMs: 30_000,
      ...options,
    }
  }

  start(): void {
    this.#running = true
    this.#attempts = 0
    void this.#drain()
  }

  stop(): void {
    this.#running = false
    this.#clearTimer()
  }

  /** Try draining now (online event, window focus, new mutation). */
  kick(): void {
    if (!this.#running) return
    this.#attempts = 0
    this.#clearTimer()
    if (this.#draining) {
      // A drain is already in flight (e.g. waiting on `process`). Flag it
      // so that when the in-flight attempt finishes, it re-enters the
      // drain loop instead of scheduling a backoff retry or stopping.
      this.#kicked = true
      return
    }
    void this.#drain()
  }

  #clearTimer(): void {
    if (this.#timer !== undefined) clearTimeout(this.#timer)
    this.#timer = undefined
  }

  async #drain(): Promise<void> {
    if (this.#draining) return
    this.#draining = true
    try {
      while (this.#running) {
        const head = this.#options.outbox.peek()
        if (head === undefined) return
        this.#kicked = false
        try {
          await this.#options.process(head)
          await this.#options.outbox.ack(head)
          this.#attempts = 0
        } catch (error) {
          if (error instanceof FatalError) {
            await this.#options.outbox.ack(head)
            this.#options.onDrop?.(head, error)
            this.#attempts = 0
            continue
          }
          if (this.#kicked) {
            // kick() arrived while `process` was in flight: retry
            // immediately with a reset backoff instead of scheduling.
            this.#kicked = false
            continue
          }
          this.#scheduleRetry()
          return
        }
      }
    } finally {
      this.#draining = false
      if (this.#kicked && this.#running) {
        this.#kicked = false
        void this.#drain()
      }
    }
  }

  #scheduleRetry(): void {
    // stop() may have run while `process()` was in flight — it clears any
    // *existing* timer, but can't clear one that's armed after the fact.
    // Guard here so a stopped loop never leaves a dangling timeout.
    if (!this.#running) return
    const { baseDelayMs, maxDelayMs, random = Math.random } = this.#options
    const exponential = Math.min(baseDelayMs * 2 ** this.#attempts, maxDelayMs)
    const delay = exponential * (0.5 + random() * 0.5)
    this.#attempts += 1
    this.#timer = setTimeout(() => void this.#drain(), delay)
  }
}
