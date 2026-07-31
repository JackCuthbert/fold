# Sync & Offline Resilience

The client renders exclusively from a local cache and writes through a
durable outbox. The network is an enhancement, never a dependency.

## Reads

- TanStack Query, persisted to IndexedDB via `persistQueryClient`.
- Cached lists and todos render instantly on load, offline included.
- Refetch on: window focus, reconnect, after outbox drain, and on interval.

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

## Offline detection & UX

- `navigator.onLine` + fetch failures.
- Header shows an **offline pill** and a queued-changes count while the
  outbox is non-empty.
- API 502 (CalDAV server down, network up) shows a distinct
  "server unreachable" pill; queue behavior is identical ([ui](./ui.md)).
  *(changed 2026-07-31: any 5xx from the API — not only 502 — shows this
  pill and queues identically; see [api](./api.md) error mapping.)*

## Failure behavior summary

| Failure | Behavior |
|---|---|
| Network offline | Offline pill; all actions queue; replay on reconnect |
| CalDAV server down (502) or any 5xx | "Server unreachable" pill; identical queueing |
| ETag conflict (412) | Rebase + retry once → else toast + refetch |
| Auth expired (401) | Route to login; outbox preserved, replays after re-login ([authentication](./authentication.md)) |
| Invalid API input (400) | Client-side bug; toast + error boundary logging |
| Malformed VTODO from server | Skip item, log warning, render the rest — never crash the list |
