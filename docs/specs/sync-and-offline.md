# Sync & Offline Resilience

The client renders exclusively from a local cache and writes through a
durable outbox. The network is an enhancement, never a dependency.

## Reads

- TanStack Query, persisted to IndexedDB via `persistQueryClient`.
- Cached lists and todos render instantly on load, offline included.
- Refetch on: window focus, reconnect, after outbox drain, and on interval.

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

## Offline detection & UX

- `navigator.onLine` + fetch failures.
- Header shows an **offline pill** and a queued-changes count while the
  outbox is non-empty.
- API 502 (CalDAV server down, network up) shows a distinct
  "server unreachable" pill; queue behavior is identical ([ui](./ui.md)).

## Failure behavior summary

| Failure | Behavior |
|---|---|
| Network offline | Offline pill; all actions queue; replay on reconnect |
| CalDAV server down (502) | "Server unreachable" pill; identical queueing |
| ETag conflict (412) | Rebase + retry once → else toast + refetch |
| Auth expired (401) | Route to login; outbox preserved, replays after re-login ([authentication](./authentication.md)) |
| Invalid API input (400) | Client-side bug; toast + error boundary logging |
| Malformed VTODO from server | Skip item, log warning, render the rest — never crash the list |
