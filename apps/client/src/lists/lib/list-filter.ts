import type { Todo, TodoList } from '@fold/schemas'

// docs/specs/list-filter.md — narrowing the derived views to some of your
// lists.
//
// The whole rule lives here: what is stored, what "showing everything"
// means, and how a stored set survives lists appearing and disappearing.
// The UI reads these and renders; it decides nothing.

/** Where the choice is kept. Survives a reload — see the spec. */
export const LIST_FILTER_KEY = 'fold:list-filter'

/**
 * The **hidden** lists, or `null` for "no filter — show everything".
 *
 * Stored as what to hide rather than what to show, and that is the single
 * most load-bearing decision in this file. The two are not symmetric once
 * lists can be created:
 *
 * - Storing what to *show* makes a list created later invisible, because
 *   it is not in the set. A filter set last week would silently swallow a
 *   list made today, from a view that gives no hint it is doing so.
 * - Storing what to *hide* shows anything the filter has never heard of.
 *   A new list appears; only the lists you actually unticked stay away.
 *
 * A filter is a temporary narrowing — "not while I am sharing my screen" —
 * not a permanent allow-list, and hiding new work behind a setting the
 * user cannot see from the view that is hiding it is the one failure this
 * feature must not have.
 *
 * Empty and `null` therefore mean the same thing, and `null` is the
 * canonical form (see `toggleList`).
 */
export type ListFilter = ReadonlySet<string> | null

/**
 * Read the stored filter.
 *
 * Anything unparseable is treated as "no filter" rather than thrown:
 * a corrupt value must never be able to hide todos, and the cost of
 * getting it wrong in that direction is a filter you have to set again.
 */
export function loadListFilter(raw: string | null): ListFilter {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    const ids = parsed.filter((id): id is string => typeof id === 'string')
    // An empty stored array would mean "show nothing", which is not a
    // state the UI can produce (see `toggleList`) and not one worth
    // restoring someone into.
    return ids.length > 0 ? new Set(ids) : null
  } catch {
    return null
  }
}

/** Serialise for storage. `null` clears the key rather than storing it. */
export const serialiseListFilter = (filter: ListFilter): string | null =>
  filter === null ? null : JSON.stringify([...filter])

/**
 * The lists a derived view should draw, given the filter.
 *
 * Everything the filter does not name — which includes every list created
 * since it was set. See `ListFilter` for why that is the whole point.
 *
 * **Never returns nothing.** A filter naming every list would empty the
 * view, which looks like a bug and gives no clue how to escape; that state
 * cannot be produced through the UI (`toggleList`), but it can be reached
 * by deleting lists until only hidden ones remain, so the guard is here
 * rather than only in the caller.
 */
export function visibleLists(
  lists: readonly TodoList[],
  filter: ListFilter,
): TodoList[] {
  if (filter === null) return [...lists]
  const shown = lists.filter((list) => !filter.has(list.id))
  return shown.length > 0 ? shown : [...lists]
}

/**
 * Todos from the visible lists only.
 *
 * A todo whose list is unknown is kept, matching `groupTodos` and
 * `partitionHealth`: an unresolvable list is a reason to show the todo
 * plainly, never a reason to hide it.
 */
export function visibleTodos(
  todos: readonly Todo[],
  lists: readonly TodoList[],
  filter: ListFilter,
): Todo[] {
  if (filter === null) return [...todos]
  const shown = new Set(visibleLists(lists, filter).map((list) => list.id))
  const known = new Set(lists.map((list) => list.id))
  return todos.filter(
    (todo) => shown.has(todo.listId) || !known.has(todo.listId),
  )
}

/**
 * Turn one list on or off — the checkbox in the popover.
 *
 * The set holds what is *hidden*, so ticking a box removes an id and
 * unticking adds one. Forgetting that inverts the whole feature, which is
 * why the type is named for it.
 *
 * **Unticking the last visible list clears the filter instead of showing
 * nothing.** "Hide all of my lists" has one sensible reading, and an empty
 * view with an invisible cause is not it.
 *
 * Dropping to zero hidden lists returns `null` rather than an empty set,
 * so there is exactly one representation of "no filter" for the header and
 * storage to test against.
 */
export function toggleList(
  filter: ListFilter,
  lists: readonly TodoList[],
  listId: string,
): ListFilter {
  const hidden = new Set(filter ?? [])
  if (hidden.has(listId)) hidden.delete(listId)
  else hidden.add(listId)
  if (hidden.size === 0) return null
  // Every list hidden — read as "clear the filter", never as an empty
  // view. `visibleLists` guards the same case for filters that get there
  // by deletion rather than by clicking.
  if (lists.every((list) => hidden.has(list.id))) return null
  return hidden
}

/**
 * Whether the filter is actually narrowing anything *right now*.
 *
 * Asked of the lists as they are, not of the stored set: a filter naming
 * two lists that have both been deleted narrows nothing, and the header
 * must not claim otherwise.
 */
export function isNarrowed(
  lists: readonly TodoList[],
  filter: ListFilter,
): boolean {
  return visibleLists(lists, filter).length < lists.length
}
