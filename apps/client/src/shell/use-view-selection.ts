import type { TodoList } from '@fold/schemas'
import { useEffect, useState } from 'react'
import { isDerivedView, TODAY_VIEW, type ViewId } from '../todos/today'

const SELECTED_LIST_KEY = 'fold:selected-list'

export interface ViewSelection {
  /** The view actually being shown — never null, never a missing list. */
  active: ViewId
  /** Select a list or derived view, persisting the choice. */
  select: (id: ViewId) => void
  /** True when `select` moved to a different view, so callers can react. */
  isSwitching: (id: ViewId) => boolean
}

/**
 * Which view is open, and the rules that keep that answer valid.
 *
 * Extracted from MainScreen (issue #28): selection, its persistence and
 * the missing-list fallback are one self-contained concern, and they were
 * three separate fragments spread through a 780-line component.
 *
 * Three rules, all of which have cost a bug before:
 *
 * **A persisted id may name a list that no longer exists** — deleted here
 * or on another device. Falling back to Today rather than to an arbitrary
 * list is what docs/specs/today-view.md specifies (Today is the default
 * view *and* the fallback), so selection never lands somewhere the user
 * did not choose.
 *
 * **The fallback only applies once the list index has actually arrived.**
 * Treating a persisted id as invalid while `lists` is still undefined
 * would flip the view to Today on every cold load; treating it as valid
 * unconditionally made the app fetch todos for a possibly-deleted list,
 * which 404s on every retry (docs/specs/api.md — error mapping). So
 * `active` computes the fallback from what is known right now, and the
 * effect below only *forgets* an id once the server has said it is gone.
 */
export function useViewSelection(lists: TodoList[] | undefined): ViewSelection {
  const [selected, setSelected] = useState<string | null>(() =>
    localStorage.getItem(SELECTED_LIST_KEY),
  )

  const selectedExists =
    selected !== null &&
    (isDerivedView(selected) ||
      (lists?.some((list) => list.id === selected) ?? false))
  const active = (selectedExists ? selected : null) ?? TODAY_VIEW

  // Drop a persisted id the server no longer knows about, so it can't come
  // back on the next load. A derived view is not a collection, so it is
  // never "missing" from the index (docs/specs/today-view.md).
  useEffect(() => {
    if (!lists || selected === null) return
    if (isDerivedView(selected)) return
    if (!lists.some((list) => list.id === selected)) {
      localStorage.removeItem(SELECTED_LIST_KEY)
      setSelected(null)
    }
  }, [lists, selected])

  return {
    active,
    select: (id) => {
      setSelected(id)
      localStorage.setItem(SELECTED_LIST_KEY, id)
    },
    // Clicking the list you are already in is not a switch — the caller
    // uses this to decide whether to close the open todo, and closing it
    // there would lose your place while the panel is still showing a todo
    // from the list still on screen. *(fixed 2026-08-03.)*
    isSwitching: (id) => id !== active,
  }
}
