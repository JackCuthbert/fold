// docs/specs/sync-and-offline.md — "Anything awaited before mount needs a
// deadline". An IndexedDB request does not only fail: it can simply never
// settle, e.g. while another tab's `deleteDatabase` is blocked on this
// tab's open connection. `catch` covers rejection but not silence, so
// anything the first render waits on must be raced against a timer, or a
// wedged database means the app never mounts at all — a blank page with no
// error and no way back short of clearing site data.
//
// Losing what was being awaited is recoverable (a migration re-runs next
// load; a query cache refetches from the server). Losing the whole UI is
// not, so the render always wins the race.

/** How long anything on the pre-mount path may block the first render. */
export const MOUNT_DEADLINE_MS = 2000

/**
 * Resolve with `work`'s value, or with `fallback` if it hasn't settled
 * within `ms`. Rejection is the caller's to handle — this only guards
 * against silence.
 */
export function withDeadline<T>(
  work: Promise<T>,
  fallback: T,
  ms: number = MOUNT_DEADLINE_MS,
): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ])
}
