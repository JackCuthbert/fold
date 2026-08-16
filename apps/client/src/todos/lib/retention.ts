import type { Todo } from '@fold/schemas'

/**
 * How far back the Summary view looks, in days
 * (docs/specs/summary-view.md — the retention window).
 *
 * **Deliberately not configurable.** It is one number that has to mean the
 * same thing in two places — how much history Summary shows, and what
 * "Clear old completed" is allowed to touch — and the safety of the second
 * comes entirely from it matching the first. A setting would let the two
 * drift apart per user, so the guarantee below would hold only for whoever
 * had not changed it.
 *
 * *(added 2026-08-09, issue #1.)*
 */
export const RETENTION_DAYS = 30

/**
 * The cutoff instant: anything completed at or after this is *recent*.
 *
 * `now` is injected so the boundary can be tested without freezing the
 * clock, and so one render resolves every row against a single instant
 * rather than drifting mid-list.
 */
export function retentionCutoff(now: Date = new Date()): Date {
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS)
  return cutoff
}

/**
 * Is this todo old enough to be cleared in bulk?
 *
 * The rule that makes bulk clearing safe: **an old todo is one Summary no
 * longer shows**, so clearing it can never destroy visible history
 * (docs/specs/todos.md — clearing completed todos).
 *
 * A todo with no `completedAt` is **never** old. It has no age to compare,
 * and assuming "no timestamp means ancient" would delete work whose date
 * is simply unknown — possibly completed minutes ago by another client
 * that did not write the property (issue #39).
 */
export function isClearableAsOld(todo: Todo, cutoff: Date): boolean {
  if (!todo.completed) return false
  if (!todo.completedAt) return false
  return new Date(todo.completedAt).getTime() < cutoff.getTime()
}

/** What a clear would affect, counted for the confirmation dialog. */
export interface ClearableCounts {
  /** Completed before the cutoff — safe to clear, invisible to Summary. */
  old: number
  /** Completed within the window — clearing these loses Summary history. */
  recent: number
  /**
   * Completed but carrying no timestamp, so neither old nor recent. Never
   * cleared by either action; counted so the dialog can say so rather than
   * leaving them to silently survive a "clear all" (issue #39).
   */
  undated: number
}

export function countClearable(
  todos: readonly Todo[],
  cutoff: Date,
): ClearableCounts {
  const counts: ClearableCounts = { old: 0, recent: 0, undated: 0 }
  for (const todo of todos) {
    if (!todo.completed) continue
    if (!todo.completedAt) counts.undated += 1
    else if (isClearableAsOld(todo, cutoff)) counts.old += 1
    else counts.recent += 1
  }
  return counts
}

/**
 * The todos a given action would delete.
 *
 * `'old'` is the safe path — everything Summary has already stopped
 * showing. `'all'` adds the recent ones, and is the heavier choice the
 * dialog makes the user pick deliberately. Neither ever includes an
 * undated todo.
 */
export function todosToClear(
  todos: readonly Todo[],
  cutoff: Date,
  scope: 'old' | 'all',
): Todo[] {
  return todos.filter((todo) => {
    if (!todo.completed || !todo.completedAt) return false
    return scope === 'all' || isClearableAsOld(todo, cutoff)
  })
}
