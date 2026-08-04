import { useQuery } from '@tanstack/react-query'
import type { RefObject } from 'react'
import { LuHistory, LuPlus, LuSun } from 'react-icons/lu'
import { InfoBadge } from '../info-badge'
import { api, useSyncEngine } from '../providers'
import { cx } from '../styles/cx'
import {
  isSummaryView,
  isTodayView,
  SUMMARY_VIEW,
  TODAY_VIEW,
} from '../todos/today'
import { useTheme } from '../use-theme'
import { ShortcutKeys } from '../shortcut-keys'
import { SHORTCUTS } from '../shortcuts'
import { ListItemMenu } from './list-item-menu'
import { markerColor } from './list-color'
import { reorder } from './list-order'
import type { ListFormState } from './use-list-form'
import styles from './list-nav.module.css'

export function useLists() {
  const engine = useSyncEngine()
  return useQuery({
    queryKey: ['lists'],
    queryFn: async () => {
      const fresh = await api.getLists()
      // A refetch must never override a pending local change — see
      // docs/specs/sync-and-offline.md.
      return engine.reconcileLists(fresh)
    },
  })
}

/**
 * The binding this button advertises.
 *
 * Looked up in SHORTCUTS rather than typed out, so the button cannot
 * advertise a chord the app does not have — the same rule the help modal
 * follows (docs/specs/ui.md — keyboard shortcuts). `undefined` if the
 * action is ever unbound, which renders nothing rather than a lie.
 */
const NEW_TODO_SHORTCUT = SHORTCUTS.find((entry) => entry.action === 'new-todo')
const NEW_LIST_SHORTCUT = SHORTCUTS.find((entry) => entry.action === 'new-list')

// docs/specs/lists.md — discover/create/rename/delete.
//
// Presentational as far as its modals go: the create/edit/delete surfaces
// are owned by `MainScreen` via `useListForm`, because on mobile this
// component renders *inside* the drawer's Dialog — where a modal would be
// nested (losing its backdrop) and would unmount at the breakpoint (losing
// its state). See `lists/use-list-form.ts`.
// *(changed 2026-08-04, issues #20 and #21.)*
export function ListNav(props: {
  selected: string | null
  onSelect: (listId: string) => void
  form: ListFormState
  /** Open the global add-todo modal (issue #15). */
  onNewTodo: () => void
  /** So the modal can restore focus here on close (main-screen.tsx). */
  newTodoRef?: RefObject<HTMLButtonElement | null>
}) {
  const lists = useLists()
  const theme = useTheme()
  const { mutate } = props.form

  // docs/specs/lists.md — reordering writes only the lists that moved:
  // swapping two adjacent lists swaps two numbers, rather than renumbering
  // the whole nav. `reorder` reads the *current* cache rather than the
  // half-updated one, so both changes are computed before either is
  // applied; each then goes through `mutate`, whose setQueryData callback
  // reads the latest cache and so builds on its predecessor.
  const move = (listId: string, direction: 'up' | 'down'): void => {
    for (const change of reorder(lists.data ?? [], listId, direction)) {
      mutate({
        id: crypto.randomUUID(),
        kind: 'setListProps',
        listId: change.listId,
        order: change.order,
      })
    }
  }

  return (
    <nav className={styles['nav']} aria-label="Lists">
      {/* The two "create something" actions, at the very top and set apart
          from the views below. New todo is issue #15 — creating one from
          anywhere, including the derived views, which have no "Add a todo"
          row of their own.

          They belong together: both open a create modal, and both are
          things you *do* rather than places you *look*. New list used to
          sit below the whole list of lists, which made two buttons of the
          same kind look unrelated. *(grouped 2026-08-04.)*

          Each prints its chord on its own face rather than hiding it in a
          tooltip: a shortcut nobody knows about may as well not exist
          (docs/specs/ui.md — keyboard shortcuts), and the button is where
          someone reaching for the mouse is already looking. */}
      <div className={styles['create']}>
        <button
          ref={props.newTodoRef}
          type="button"
          className={styles['newTodo']}
          onClick={props.onNewTodo}
        >
          <LuPlus aria-hidden="true" size={16} />
          New todo
          {NEW_TODO_SHORTCUT && (
            <span className={styles['navKey']}>
              <ShortcutKeys shortcut={NEW_TODO_SHORTCUT} onFilled />
            </span>
          )}
        </button>
        {/* docs/specs/ui.md — one left edge, including controls: a literal
            "+ " prefix is text, so it sat at the label's inset rather than
            on the icon column every other nav row aligns to. A real icon
            lines up with Settings' gear. The accessible name keeps the
            "+ New list" wording the e2e suite matches on. */}
        <button
          type="button"
          className={styles['add']}
          aria-label="+ New list"
          onClick={props.form.openCreate}
        >
          <LuPlus aria-hidden="true" size={16} />
          New list
          {NEW_LIST_SHORTCUT && (
            <span className={styles['navKey']}>
              <ShortcutKeys shortcut={NEW_LIST_SHORTCUT} />
            </span>
          )}
        </button>
      </div>

      {/* docs/specs/today-view.md, docs/specs/summary-view.md — derived
          views pinned above the real lists, and visually distinct from
          them: ghost buttons (link appearance only, unlike every other
          control in the nav), set off as a group by space rather than a
          divider, with no kebab menu because there is nothing on the
          server to rename or delete. */}
      {/* Each view is a row, not just a button: the badge is a control in
          its own right (a popover trigger) and must not be nested inside
          the button that selects the view — a button inside a button is
          invalid, and a tap meant for the badge would also switch views.
          The row wrapper puts them side by side instead, with the button
          taking the width so the icon and label keep the nav's shared left
          edge (docs/specs/ui.md — one left edge). *(added 2026-08-03.)* */}
      <div className={styles['views']}>
        <div className={styles['viewRow']}>
          <button
            type="button"
            className={cx(
              styles['today'],
              isTodayView(props.selected) && styles['todayActive'],
            )}
            onClick={() => props.onSelect(TODAY_VIEW)}
          >
            <LuSun aria-hidden="true" size={16} />
            Today
          </button>
          {/* Shorter than the help modal's wording on purpose, and saying
              the same thing — help-modal.tsx, "Today and Summary". */}
          <InfoBadge label="About Today">
            Everything due today or already overdue, gathered from all your
            lists. A view, not a list you can add to.
          </InfoBadge>
        </div>
        <div className={styles['viewRow']}>
          <button
            type="button"
            className={cx(
              styles['today'],
              isSummaryView(props.selected) && styles['todayActive'],
            )}
            onClick={() => props.onSelect(SUMMARY_VIEW)}
          >
            <LuHistory aria-hidden="true" size={16} />
            Summary
          </button>
          <InfoBadge label="About Summary">
            What you&rsquo;ve finished, grouped by day — handy for a standup. A
            view, not a list you can add to.
          </InfoBadge>
        </div>
      </div>

      <ul>
        {(lists.data ?? []).map((list, index, all) => (
          <li
            key={list.id}
            // The selection marker is the shell's own left border, so the
            // colour goes here rather than on the button inside it —
            // otherwise it sits *within* the grey border and stops short
            // of the rounded corner. *(moved 2026-08-04.)*
            className={cx(
              styles['item'],
              list.id === props.selected && styles['itemActive'],
            )}
            style={
              list.id === props.selected
                ? { borderLeftColor: markerColor(list.color, theme) }
                : undefined
            }
          >
            <button
              type="button"
              className={cx(
                styles['link'],
                list.id === props.selected && styles['linkActive'],
              )}
              onClick={() => props.onSelect(list.id)}
            >
              {/* docs/specs/lists.md — colours: every list gets a dot,
                  filled or not. An unfilled ring for a list with no colour
                  keeps every name on the same left edge and the row rhythm
                  identical down the nav; omitting it would make an
                  uncoloured list read as a different kind of row and shift
                  its name the moment a colour was assigned. */}
              <span
                className={cx(
                  styles['dot'],
                  list.color === undefined && styles['dotEmpty'],
                )}
                style={
                  list.color !== undefined
                    ? { background: list.color }
                    : undefined
                }
                aria-hidden="true"
              />
              {list.displayName}
            </button>
            <ListItemMenu
              displayName={list.displayName}
              canMoveUp={index > 0}
              canMoveDown={index < all.length - 1}
              onMoveUp={() => move(list.id, 'up')}
              onMoveDown={() => move(list.id, 'down')}
              onEdit={() => props.form.openEdit(list)}
              onDelete={() => props.form.openDelete(list)}
            />
          </li>
        ))}
      </ul>

      {/* No modals here. The create/edit/delete surfaces are rendered by
          MainScreen as siblings of the drawer — see the note on this
          component and `lists/use-list-form.ts`. */}
    </nav>
  )
}
