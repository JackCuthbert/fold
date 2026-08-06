import type { Todo } from '@fold/schemas'

/**
 * The line under a view's title: how much is in it, and how much is done.
 *
 * docs/specs/ui.md — the header. Deliberately a pure function of the todos
 * already on screen: the view has them loaded because it is rendering
 * them, so this costs no request and is right on the first paint, even
 * against a slow server.
 *
 * `null` means render nothing. That is not the same as "no todos" — a view
 * whose todos haven't arrived yet must stay silent rather than claim the
 * list is empty and then contradict itself a moment later.
 */
export function countSummary(
  todos: readonly Todo[] | undefined,
  { pending = false }: { pending?: boolean } = {},
): string | null {
  if (pending || todos === undefined) return null
  if (todos.length === 0) return 'No todos'

  const done = todos.filter((todo) => todo.completed).length
  const active = todos.length - done
  // Nothing left to do, but work was done: report only that. "0 todos"
  // reads as a bug rather than a state, and the done count already says
  // the view isn't empty. *(changed 2026-08-04.)*
  if (active === 0) return `${done} done`
  // The headline is what's *left*, so the number falls as work is
  // finished. A total that never moves is noise.
  const head = `${active} ${active === 1 ? 'todo' : 'todos'}`
  // Completed is only worth the words once there is some.
  return done === 0 ? head : `${head} · ${done} done`
}
