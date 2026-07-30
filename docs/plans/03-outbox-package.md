# Plan 03: `packages/outbox` — Durable Queue + Sync Loop

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tested, publishable, storage-agnostic FIFO mutation queue (`Outbox`) and drain loop (`SyncLoop`) with exponential backoff, coalescing hook, and fatal-vs-retryable error semantics.

**Architecture:** Fully generic over mutation type `M` — zero knowledge of todos, zod schemas injected as a `parse` function at the trust boundary, storage injected as an adapter (client supplies IndexedDB in plan 05; tests use `memoryStorage`). Spec: [sync-and-offline](../specs/sync-and-offline.md).

**Tech Stack:** Plain TypeScript, no runtime dependencies. vitest with fake timers.

---

### Task 1: Scaffold + `Outbox` durability behavior

**Files:**
- Create: `packages/outbox/package.json`, `packages/outbox/tsconfig.json`,
  `packages/outbox/src/{storage,outbox}.ts`
- Test: `packages/outbox/test/outbox.test.ts`

- [ ] **Step 1: Scaffold**

`packages/outbox/package.json`:

```json
{
  "name": "@caldav-todo/outbox",
  "version": "0.1.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit" },
  "devDependencies": { "typescript": "^7.0.0", "vitest": "^3.0.0" }
}
```

`packages/outbox/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

Run: `bun install`

- [ ] **Step 2: Write the failing test**

`packages/outbox/test/outbox.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { Outbox } from '../src/outbox'
import { memoryStorage } from '../src/storage'

interface Msg {
  id: string
  text: string
}

const parse = (raw: unknown): Msg | null =>
  typeof raw === 'object' && raw !== null && 'id' in raw && 'text' in raw
    ? (raw as Msg)
    : null

describe('Outbox', () => {
  it('enqueues and drains FIFO', async () => {
    const outbox = await Outbox.open({ storage: memoryStorage(), parse })
    await outbox.enqueue({ id: '1', text: 'a' })
    await outbox.enqueue({ id: '2', text: 'b' })
    expect(outbox.peek()?.id).toBe('1')
    await outbox.ack()
    expect(outbox.peek()?.id).toBe('2')
    await outbox.ack()
    expect(outbox.size()).toBe(0)
  })

  it('survives a restart over the same storage', async () => {
    const storage = memoryStorage()
    const first = await Outbox.open({ storage, parse })
    await first.enqueue({ id: '1', text: 'a' })
    await first.enqueue({ id: '2', text: 'b' })

    const second = await Outbox.open({ storage, parse })
    expect(second.size()).toBe(2)
    expect(second.peek()?.id).toBe('1')
  })

  it('drops entries the parser rejects on load', async () => {
    const storage = memoryStorage()
    await storage.save([{ id: '1', text: 'ok' }, { corrupt: true }, 42])
    const outbox = await Outbox.open({ storage, parse })
    expect(outbox.size()).toBe(1)
  })

  it('applies the coalesce hook on enqueue', async () => {
    const coalesce = (queue: readonly Msg[], incoming: Msg): Msg[] => [
      ...queue.filter((m) => m.id !== incoming.id),
      incoming,
    ]
    const outbox = await Outbox.open({
      storage: memoryStorage(),
      parse,
      coalesce,
    })
    await outbox.enqueue({ id: '1', text: 'a' })
    await outbox.enqueue({ id: '1', text: 'b' })
    expect(outbox.size()).toBe(1)
    expect(outbox.peek()?.text).toBe('b')
  })

  it('notifies onChange with the queue size', async () => {
    const onChange = vi.fn()
    const outbox = await Outbox.open({
      storage: memoryStorage(),
      parse,
      onChange,
    })
    await outbox.enqueue({ id: '1', text: 'a' })
    expect(onChange).toHaveBeenLastCalledWith(1)
    await outbox.ack()
    expect(onChange).toHaveBeenLastCalledWith(0)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun run test -- packages/outbox`
Expected: FAIL — cannot resolve `../src/outbox`.

- [ ] **Step 4: Implement**

`packages/outbox/src/storage.ts`:

```ts
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
```

`packages/outbox/src/outbox.ts`:

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run test -- packages/outbox`
Expected: PASS.

- [ ] **Step 6: Lint, format, commit**

```bash
bun run lint && bun run fmt
git add -A && git commit -m "feat(outbox): durable FIFO queue with coalescing"
```

---

### Task 2: `SyncLoop` — drain, backoff, fatal drops

**Files:**
- Create: `packages/outbox/src/{sync-loop,errors,index}.ts`
- Test: `packages/outbox/test/sync-loop.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/outbox/test/sync-loop.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FatalError, RetryableError } from '../src/errors'
import { Outbox } from '../src/outbox'
import { memoryStorage } from '../src/storage'
import { SyncLoop } from '../src/sync-loop'

interface Msg {
  id: string
}
const parse = (raw: unknown): Msg | null =>
  typeof raw === 'object' && raw !== null && 'id' in raw ? (raw as Msg) : null

const flush = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0)
}

describe('SyncLoop', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('drains the queue FIFO', async () => {
    const outbox = await Outbox.open({ storage: memoryStorage(), parse })
    await outbox.enqueue({ id: '1' })
    await outbox.enqueue({ id: '2' })
    const seen: string[] = []
    const loop = new SyncLoop({
      outbox,
      process: (m) => {
        seen.push(m.id)
        return Promise.resolve()
      },
    })
    loop.start()
    await flush()
    expect(seen).toEqual(['1', '2'])
    expect(outbox.size()).toBe(0)
    loop.stop()
  })

  it('retries with exponential backoff on RetryableError', async () => {
    const outbox = await Outbox.open({ storage: memoryStorage(), parse })
    await outbox.enqueue({ id: '1' })
    const process = vi
      .fn<(m: Msg) => Promise<void>>()
      .mockRejectedValueOnce(new RetryableError('offline'))
      .mockRejectedValueOnce(new RetryableError('offline'))
      .mockResolvedValue(undefined)
    // random: () => 1 makes the jitter factor exactly 1.
    const loop = new SyncLoop({
      outbox,
      process,
      baseDelayMs: 1000,
      random: () => 1,
    })
    loop.start()
    await flush()
    expect(process).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(999)
    expect(process).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(process).toHaveBeenCalledTimes(2)

    // second retry doubles: 2000ms
    await vi.advanceTimersByTimeAsync(2000)
    expect(process).toHaveBeenCalledTimes(3)
    expect(outbox.size()).toBe(0)
    loop.stop()
  })

  it('caps the backoff at maxDelayMs', async () => {
    const outbox = await Outbox.open({ storage: memoryStorage(), parse })
    await outbox.enqueue({ id: '1' })
    const process = vi
      .fn<(m: Msg) => Promise<void>>()
      .mockRejectedValue(new RetryableError('offline'))
    const loop = new SyncLoop({
      outbox,
      process,
      baseDelayMs: 1000,
      maxDelayMs: 4000,
      random: () => 1,
    })
    loop.start()
    await flush()
    // delays: 1000, 2000, 4000, 4000 (capped), ...
    await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000 + 4000)
    expect(process).toHaveBeenCalledTimes(5)
    loop.stop()
  })

  it('drops the mutation and reports on FatalError', async () => {
    const outbox = await Outbox.open({ storage: memoryStorage(), parse })
    await outbox.enqueue({ id: 'bad' })
    await outbox.enqueue({ id: 'good' })
    const seen: string[] = []
    const onDrop = vi.fn()
    const loop = new SyncLoop({
      outbox,
      process: (m) => {
        if (m.id === 'bad') return Promise.reject(new FatalError('conflict'))
        seen.push(m.id)
        return Promise.resolve()
      },
      onDrop,
    })
    loop.start()
    await flush()
    expect(onDrop).toHaveBeenCalledWith({ id: 'bad' }, expect.any(FatalError))
    expect(seen).toEqual(['good'])
    expect(outbox.size()).toBe(0)
    loop.stop()
  })

  it('kick() retries immediately and resets the backoff', async () => {
    const outbox = await Outbox.open({ storage: memoryStorage(), parse })
    await outbox.enqueue({ id: '1' })
    const process = vi
      .fn<(m: Msg) => Promise<void>>()
      .mockRejectedValueOnce(new RetryableError('offline'))
      .mockResolvedValue(undefined)
    const loop = new SyncLoop({
      outbox,
      process,
      baseDelayMs: 60_000,
      random: () => 1,
    })
    loop.start()
    await flush()
    expect(process).toHaveBeenCalledTimes(1)
    loop.kick() // e.g. the browser 'online' event
    await flush()
    expect(process).toHaveBeenCalledTimes(2)
    expect(outbox.size()).toBe(0)
    loop.stop()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- packages/outbox`
Expected: FAIL — cannot resolve `../src/sync-loop`.

- [ ] **Step 3: Implement**

`packages/outbox/src/errors.ts`:

```ts
/** Transient failure (network down, 5xx): keep the mutation, retry later. */
export class RetryableError extends Error {
  override name = 'RetryableError'
}

/** Permanent failure (unresolvable conflict): drop the mutation. */
export class FatalError extends Error {
  override name = 'FatalError'
}
```

`packages/outbox/src/sync-loop.ts`:

```ts
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

  constructor(options: SyncLoopOptions<M>) {
    this.#options = {
      baseDelayMs: 1000,
      maxDelayMs: 30_000,
      ...options,
    }
  }

  start(): void {
    this.#running = true
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
        try {
          await this.#options.process(head)
          await this.#options.outbox.ack()
          this.#attempts = 0
        } catch (error) {
          if (error instanceof FatalError) {
            await this.#options.outbox.ack()
            this.#options.onDrop?.(head, error)
            this.#attempts = 0
            continue
          }
          this.#scheduleRetry()
          return
        }
      }
    } finally {
      this.#draining = false
    }
  }

  #scheduleRetry(): void {
    const { baseDelayMs, maxDelayMs, random = Math.random } = this.#options
    const exponential = Math.min(baseDelayMs * 2 ** this.#attempts, maxDelayMs)
    const delay = exponential * (0.5 + random() * 0.5)
    this.#attempts += 1
    this.#timer = setTimeout(() => void this.#drain(), delay)
  }
}
```

`packages/outbox/src/index.ts`:

```ts
export { FatalError, RetryableError } from './errors'
export { Outbox, type OutboxOptions } from './outbox'
export { memoryStorage, type OutboxStorage } from './storage'
export { SyncLoop, type SyncLoopOptions } from './sync-loop'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- packages/outbox`
Expected: PASS (all outbox + sync-loop tests).

- [ ] **Step 5: Typecheck**

Run: `bun run --filter @caldav-todo/outbox typecheck`
Expected: exit 0.

- [ ] **Step 6: Lint, format, commit**

```bash
bun run lint && bun run fmt
git add -A && git commit -m "feat(outbox): SyncLoop with backoff and fatal drops"
```
