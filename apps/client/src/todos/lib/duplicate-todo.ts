import type { NewTodo, Todo } from '@fold/schemas'

/** Marks a copy without burying the words you actually read. */
export const COPY_SUFFIX = ' (copy)'

/**
 * The `NewTodo` for duplicating an existing todo.
 *
 * docs/specs/todos.md — duplicating a todo. Editing a *completed* todo is
 * either fixing a mistake or starting new work; this is the second case,
 * and it exists so the read-only guard on a completed todo is a choice
 * rather than an obstacle (issue #25).
 *
 * **The copy is never completed.** That is structural rather than
 * remembered: `NewTodo` has no `completed` field at all, so a duplicate of
 * a finished todo is born active and carries none of its completion
 * metadata (no `COMPLETED`, so no punctuality or cycle time).
 *
 * `created` is deliberately *not* carried over — `useTodoActions.add`
 * stamps a fresh one, which is right: the copy is new work, and ordering
 * depends on it (docs/specs/todos.md — ordering).
 *
 * The due date *is* carried over. Clearing it would silently drop
 * information the user can remove in one keystroke, and a copy of an
 * overdue todo being overdue is arguably correct — the work still isn't
 * done.
 */
export function duplicateTodo(todo: Todo, uid: string): NewTodo {
  return {
    uid,
    summary: `${todo.summary}${COPY_SUFFIX}`,
    // Exact-optional: these keys must be absent rather than undefined
    // (tsconfig `exactOptionalPropertyTypes`).
    ...(todo.due ? { due: todo.due } : {}),
    ...(todo.description ? { description: todo.description } : {}),
    ...(todo.priority ? { priority: todo.priority } : {}),
  }
}
