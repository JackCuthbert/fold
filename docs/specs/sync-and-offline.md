# Sync & Offline Resilience

The client renders exclusively from a local cache and writes through a
durable outbox. The network is an enhancement, never a dependency.

## Reads

- TanStack Query, persisted to IndexedDB via `persistQueryClient`.
- Cached lists and todos render instantly on load, offline included.
- Refetch on: window focus, reconnect, after outbox drain, and on interval.
- Persistence to IndexedDB is write-behind, throttled
  (`createAsyncStoragePersister`'s default 1s), not synchronous with the
  in-memory cache update. *(added 2026-07-31: a reload landing inside that
  window restores the previous snapshot; combined with `staleTime: 30_000`
  on todos/lists, the restored data isn't refetched for up to 30s. This is
  accepted, deliberate offline-first behavior — the alternative is
  blocking every mutation on a disk write — but it means anything (a test,
  a future feature) that reloads immediately after a mutation must not
  assume the persisted copy is already caught up; see
  `e2e/tests/helpers.ts`'s `waitForPersistedCompleted` for how the e2e
  suite accounts for it.)*

## The client is authoritative while work is queued

*(added 2026-07-31: refetching after every mutation made the server's
response race the optimistic update — items reordered mid-interaction and a
just-completed todo could visibly revert.)*

**The UI must never churn as a consequence of syncing.** Rules:

- **No refetch while the outbox is non-empty.** A successful mutation does
  not invalidate anything on its own. Refetch only once the queue has fully
  drained, plus the ordinary triggers (focus, reconnect, interval).
- **A refetch never overrides a pending local change.** When server data
  arrives, re-apply every queued mutation on top of it before it reaches the
  UI, so the user keeps seeing their own edits.
- **Genuinely new server data appears immediately.** Changes made elsewhere
  (another client, another device) render as soon as they arrive — this rule
  suppresses *echoes of our own writes*, not real remote updates.
- **Sort order is stable during interaction.** Re-sorting is allowed on load,
  on list switch, and on a real remote change — never as the direct result of
  the user ticking a checkbox. A todo that becomes complete moves to the
  completed section; it must not drag unrelated items around with it.
- A dropped (fatal) mutation still refetches, since the cache is then known
  to be wrong.

### Renaming a persisted key

Persisted keys are part of the data contract, not just names. Changing one
without migrating it silently discards whatever it held — for the outbox
that means **losing writes the user made offline that have not yet reached
the server**.

So any rename must copy first and delete second, and must be safe to re-run
(a tab closed midway, a quota error): skip when the source is absent, and
let a value already present at the destination win, so a stale copy can
never clobber a newer one. The migration runs before the app mounts, since
the sync loop reads the queue as soon as the tree renders.

**Anything awaited before mount needs a deadline.** An IndexedDB request
does not only fail — it can simply never settle (for instance while another
tab's `deleteDatabase` is blocked on this tab's open connection). A `catch`
covers rejection but not silence, so a wedged database means the app never
mounts at all: a blank page with no error. Losing a migration is
recoverable — it re-runs on the next load, and is written to be repeatable
— whereas losing the whole UI is not, so the render must win the race.
*(added 2026-08-02, after reproducing exactly that blank page.)*

This applies to **every** pre-mount path, not just the one that was found
first. There are three, and each was a separate blank page: the storage-key
migration, the persisted query cache's `restoreClient`, and the **outbox's
own `load()`** — `Outbox.open` awaits it, `createSyncEngine` awaits that,
and the provider renders nothing until the engine exists.
*(added 2026-08-04, issue #17.)*

### A queue that can't be read must not be overwritten

The outbox is not the query cache, and the same fallback is not safe for
both. Losing a cached read costs a slower first paint; the queue holds
**writes the user believes are saved**.

So when the queue can't be read — a hang that outlives the deadline, or an
outright rejection — the fallback is a store that **refuses every write**,
never an empty writable one:

- The entries are still on disk, unread. An ordinary empty store would let
  the next `save()` overwrite them with the empty queue, turning
  "temporarily unreadable" into "permanently destroyed".
- Each refused write reaches `onPersistError`, so the failure is visible
  rather than silent — the user is told their changes aren't being written
  down. A silent fallback that looks like it worked is the worst outcome.
- The in-memory queue still works, so the sync loop drains it to the server
  as usual. That — not the local copy — is what actually saves the work.
  What is lost is only durability across a reload, and the user is told so.

*(added 2026-08-01: the project rename from `caldav-todo*` to `fold*` moved
every persisted key — see `apps/client/src/storage-migration.ts`.)*

## Writes (the outbox)

`packages/outbox` — a generic durable FIFO mutation queue with an injectable
storage adapter (the client supplies IndexedDB). Every user action:

1. Optimistically updates the TanStack Query cache.
2. Appends a `Mutation` (zod-validated discriminated union: `createTodo`,
   `updateTodo`, `deleteTodo`, `createList`, `renameList`, `deleteList`) to
   the outbox.
3. The sync loop drains the outbox FIFO against the JSON API
   ([api](./api.md)).

### Sync loop

- Triggered by: outbox append, the `online` event, window focus, and a
  periodic timer.
- Exponential backoff with jitter on failure (cap ~30s).
- **Coalescing:** two updates to the same todo merge; a create followed by
  updates merges into the create; create + delete cancels out.
- **Acking by identity, not position.** `Outbox.ack()` takes the exact
  mutation instance that was processed and removes it from the queue by
  reference, wherever it currently sits — never "whatever is at the front
  now". *(added 2026-07-31: an index-based `ack()` — `slice(1)` — silently
  dropped the wrong mutation when a UI action enqueued a new mutation for
  the same todo while the current head was still in flight. Concretely:
  complete a todo, then immediately delete it before the completion has
  synced — coalescing correctly drops the queued `updateTodo` and keeps
  only the `deleteTodo`, but that rewrite happens on `#queue` while
  `process()` for the *original* update is still awaiting the network.
  Once that update resolves, index-based `ack()` removed whatever was now
  at position 0 — the delete — instead of the update that actually ran,
  discarding the user's delete with no error, toast, or trace. Reproduced
  deterministically in `packages/outbox/test/sync-loop.test.ts` and fixed
  by having `SyncLoop` pass the processed mutation to `ack(mutation)`,
  which removes it by reference; if coalescing already moved past it —
  either dropped (as above) or replaced with a merged object at the same
  position, which is what happens for two consecutive edits to the same
  todo — `ack()` is a safe no-op and whatever coalescing left behind stays
  queued untouched. Both shapes are covered in
  `packages/outbox/test/sync-loop.test.ts`.)*

## Conflict handling (last-write-wins)

- Every update carries the ETag the client last saw; the server forwards it
  as `If-Match` ([caldav-compliance](./caldav-compliance.md)).
- On 412: the client takes the fresh copy from the response body, rebases its
  managed-field changes on top, and retries once with the new ETag.
- If the retry also fails: drop the mutation, toast
  ("Couldn't save '<summary>' — it changed on the server"), and refetch.
- *(changed 2026-07-31: any other fatal drop (e.g. a 4xx we don't otherwise
  handle) is never a conflict — nothing "changed on the server" in that
  case. The toast for a non-conflict drop is a plain "Couldn't save
  '<summary>'", so the message never claims a conflict that didn't happen.)*

## Status must reflect reality

*(added 2026-07-31: a stale `blocked` flag reported "Server unreachable"
while signed in against a healthy server.)*

The displayed status is **derived from current conditions**, never latched
history:

- It clears on the next successful request, not only when the queue empties.
- It is never shown when nothing is queued and nothing is failing.
- A signed-in session against a reachable server must show the healthy
  state, regardless of any earlier transient failure.
- **A failed read must keep trying, without being asked to.** A degraded
  status has to be able to clear itself: if the only thing that would
  re-evaluate it is the user clicking something, then "current conditions"
  really means "conditions when you last interacted", which is latched
  history wearing a different hat.
  *(added 2026-08-06, issue #30: a read that exhausted its retries left the
  view showing a red "Disconnected" dot and a count line stuck as a
  skeleton, permanently. Two things had to hold for that to happen — the
  query gave up after a single retry ~1s later, and the 45s refetch
  interval that would otherwise have healed it is focus-gated by
  TanStack Query, so it does not run in a background tab at all. Reads now
  retry across the full backoff ladder (~30s) and the interval runs
  unfocused. Covered by `e2e/tests/recovery.spec.ts`, which fails a read
  for a fixed window and asserts the view comes back with no interaction —
  its recovery budget is set between the measured before/after figures so a
  regression fails it rather than merely slowing it down.)*

  The outage in that test is deliberately **shorter than the retry ladder**
  and longer than a single retry, so recovery comes from the ladder itself
  rather than from the 45s poll. An outage long enough to exhaust every
  attempt is a truer reproduction of the captured failure, but it makes the
  result depend on where the outage's end falls between attempts — which
  moves with machine speed, and duly passed locally while timing out on
  CI's slower runner. *(fixed 2026-08-06.)*

## Offline detection & UX

- `navigator.onLine` + fetch failures.
- Header shows an **offline pill** and a queued-changes count while the
  outbox is non-empty.
- API 502 (CalDAV server down, network up), or any 5xx, marks the server
  unreachable; queue behavior is identical either way
  ([api](./api.md) error mapping).
  *(changed 2026-07-31: this state no longer gets its own pill text — a
  transient upstream failure while work was queued made the pill announce
  "Server unreachable" for a second and vanish, which read as a flash of
  broken UI for a condition the sync layer was already handling. Server
  reachability now lives on the nav footer's status dot instead — red and
  gently pulsing, with an accessible label — while the pill keeps showing
  whatever text was already true (`Syncing N changes`, `Offline · N
  queued`, or nothing if the queue is empty); see [ui](./ui.md) — status
  display.)*

## Failure behavior summary

| Failure | Behavior |
|---|---|
| Network offline | Offline pill; all actions queue; replay on reconnect |
| CalDAV server down (502) or any 5xx | Status dot turns red/pulsing; identical queueing; pill text unchanged (or absent if nothing is queued) |
| ETag conflict (412) | Rebase + retry once → else toast + refetch |
| Auth expired (401) | Route to login; outbox preserved, replays after re-login ([authentication](./authentication.md)) |
| Invalid API input (400) | Client-side bug; toast + error boundary logging |
| Malformed VTODO from server | Skip item, log warning, render the rest — never crash the list |
