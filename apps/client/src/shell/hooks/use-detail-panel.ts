import type { Todo } from '@fold/schemas'
import { useRef, useState } from 'react'

export interface DetailPanel {
  /** The todo whose panel is open, or null. */
  openTodo: Todo | null
  /**
   * Increments on every open, including re-opening the todo already
   * showing — the panel keys its focus effect on this. See `open`.
   */
  openCount: number
  open: (todo: Todo, trigger: HTMLElement | null) => void
  /**
   * Show a different todo without disturbing where focus will return to.
   *
   * For duplicating: the copy is opened from *inside* the panel, so there
   * is no new row to remember — closing it should still land on the row
   * that opened the original (issue #25).
   */
  replace: (todo: Todo) => void
  close: () => void
}

/**
 * Which todo the detail panel is showing, and where focus goes on close.
 *
 * Extracted from MainScreen (issue #28).
 *
 * docs/specs/ui.md — the detail panel: on desktop the panel is a layout
 * column, a sibling of `<main>` rather than a child, so which todo is open
 * has to live above both — a pane inside `<main>` cannot render a column
 * beside it. The whole todo is held rather than a bare uid because Today,
 * Tomorrow, Summary and Search draw rows from several lists at once, where
 * a uid alone is ambiguous. *(added 2026-08-03, issue #4.)*
 */
export function useDetailPanel(): DetailPanel {
  const [openTodo, setOpenTodo] = useState<Todo | null>(null)
  const [openCount, setOpenCount] = useState(0)
  // The row that opened the panel, so focus can go back to it on close.
  // Explicit rather than inferred: the panel is not modal on desktop, so
  // nothing restores focus for us, and a heuristic is untrustworthy once a
  // save re-renders and reorders the list — the same reasoning as
  // `triggerRef` in add-todo-modal.tsx.
  const openTrigger = useRef<HTMLElement | null>(null)

  return {
    openTodo,
    openCount,
    open: (todo, trigger) => {
      openTrigger.current = trigger
      setOpenTodo(todo)
      // Bumped on every open, including re-clicking the row that is already
      // showing. The panel keys its focus effect on this rather than on the
      // todo, because clicking the open row changes neither `openTodo` nor
      // the `key` — so without it that click would leave focus out on the
      // row while the panel sits there looking focused, and the next Escape
      // would go to the row instead of closing the panel.
      setOpenCount((count) => count + 1)
    },
    replace: (todo) => {
      setOpenTodo(todo)
      setOpenCount((count) => count + 1)
    },
    close: () => {
      setOpenTodo(null)
      // Return focus to the row that opened the panel. Deferred a frame so
      // it lands after the panel has gone: focusing while the panel is
      // still mounted and about to be made `inert` leaves focus nowhere,
      // which drops the user back to the top of the document.
      const trigger = openTrigger.current
      openTrigger.current = null
      if (trigger) requestAnimationFrame(() => trigger.focus())
    },
  }
}
