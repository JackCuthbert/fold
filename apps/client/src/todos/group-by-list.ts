import type { Todo, TodoList } from '@fold/schemas'
import { featuresOf } from '../lists/list-kind'

// docs/specs/list-kinds.md — grouping in derived views.
//
// Deliberately *not* part of `selectToday` or `summariseCompleted`. Those
// answer "which todos belong to this slice of time", and grouping is a
// question about how to draw the answer. Keeping them apart is what lets
// the time rules stay testable on their own, and what stops a grouping
// change from being able to alter which todos a view contains.

/** A grouping list's todos, collapsed to one row. */
export interface TodoGroup {
  kind: 'group'
  listId: string
  listName: string
  /** The todos behind the row — the count is what gets displayed. */
  todos: Todo[]
}

/** An ordinary todo, drawn as its own row. */
export interface TodoRow {
  kind: 'todo'
  todo: Todo
}

export type DerivedRow = TodoGroup | TodoRow

/**
 * Collapse todos from grouping lists into one row each, leaving every
 * other todo alone.
 *
 * Order is preserved by **first appearance**: a group takes the position
 * of its earliest todo, so a grocery item that sorts to the top of Today
 * puts the Groceries row at the top. The caller has already sorted, and
 * this must not undo that — regrouping to the end would move a row that
 * was placed by due time to somewhere that means nothing.
 *
 * A group of one still groups (docs/specs/list-kinds.md): a row whose
 * shape depends on how much shopping is outstanding is harder to learn
 * than one that is always the same.
 */
export function groupTodos(
  todos: readonly Todo[],
  lists: readonly TodoList[],
): DerivedRow[] {
  const byId = new Map(lists.map((list) => [list.id, list]))
  const rows: DerivedRow[] = []
  const groups = new Map<string, TodoGroup>()

  for (const todo of todos) {
    const list = byId.get(todo.listId)
    // An unknown list cannot be looked up for its kind, so it cannot
    // group — the todo is drawn on its own, which is the safe default.
    if (!list || !featuresOf(list.displayName).groups) {
      rows.push({ kind: 'todo', todo })
      continue
    }
    const existing = groups.get(todo.listId)
    if (existing) {
      existing.todos.push(todo)
      continue
    }
    const group: TodoGroup = {
      kind: 'group',
      listId: todo.listId,
      listName: list.displayName,
      todos: [todo],
    }
    groups.set(todo.listId, group)
    // Pushed at first appearance, then mutated as more of its todos are
    // found. The array holds the reference, so later pushes are visible
    // without a second pass.
    rows.push(group)
  }

  return rows
}
