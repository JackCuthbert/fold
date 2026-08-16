import type { TodoList } from '@fold/schemas'
import type { RowList } from '../todo-meta/todo-meta'

/**
 * Resolve a todo's list to what its row needs to draw: the name, and the
 * colour for the dot (docs/specs/ui.md — the todo row).
 *
 * Every derived view had its own `listName` helper doing the same lookup,
 * and adding the colour would have meant changing the same three lines in
 * three places. One function, since the answer cannot differ between views.
 *
 * Returns `undefined` for a list the index does not know about, which the
 * row treats as "say nothing" rather than drawing an empty pill. That is a
 * real case, not a defensive one: a todo can outlive the list it names
 * while the index is still loading, or after another client deletes it.
 *
 * *(added 2026-08-09, issue #2.)*
 */
export function rowListFor(
  lists: readonly TodoList[],
  listId: string,
): RowList | undefined {
  const list = lists.find((candidate) => candidate.id === listId)
  if (!list) return undefined
  return {
    displayName: list.displayName,
    ...(list.color === undefined ? {} : { color: list.color }),
  }
}
