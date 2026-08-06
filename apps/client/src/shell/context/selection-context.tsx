import type { Todo } from '@fold/schemas'
import { createContext, use, type ReactNode } from 'react'

export interface Selection {
  /** The view being shown — a list id or a `view:` sentinel. */
  active: string
  /**
   * Go to a list or derived view.
   *
   * Also closes the detail panel when this is a real switch: the open todo
   * may not exist in the view being moved to, and a panel showing a todo
   * from the view you just left is worse than no panel.
   */
  select: (id: string) => void
  /** Open a todo in the detail panel, remembering the row for focus. */
  openDetail: (todo: Todo, trigger: HTMLElement | null) => void
}

const SelectionContext = createContext<Selection | null>(null)

/**
 * Which view is open, and how to change it.
 *
 * A context rather than props because `select` is called from six places
 * spread across four components — the nav rows, a grouped row in a pane,
 * the add-todo modal following a new todo to its list, the list-create
 * form, the shortcut handler and the filter moving you off a list you just
 * hid. Threading one callback through four levels to reach a row deep in a
 * pane said nothing except "this is passed down".
 *
 * `openDetail` travels with it because it has the same shape of problem:
 * every pane needs it, and only to hand it to a row.
 *
 * *(added 2026-08-06, issue #28.)*
 */
interface SelectionProviderProps {
  value: Selection
  children: ReactNode
}

export function SelectionProvider(props: SelectionProviderProps) {
  return (
    <SelectionContext value={props.value}>{props.children}</SelectionContext>
  )
}

export function useSelection(): Selection {
  const value = use(SelectionContext)
  if (!value) throw new Error('useSelection outside SelectionProvider')
  return value
}
