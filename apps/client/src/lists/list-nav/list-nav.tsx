import { useQuery } from '@tanstack/react-query'
import type { RefObject } from 'react'
import type { IconType } from 'react-icons'
import {
  LuHistory,
  LuPlus,
  LuSearch,
  LuSparkles,
  LuSun,
  LuSunrise,
} from 'react-icons/lu'
import { api, useSyncEngine } from '../../providers'
import { cx } from '../../styles/cx'
import {
  DERIVED_VIEWS,
  SEARCH_VIEW,
  SUMMARY_VIEW,
  TODAY_VIEW,
  TOMORROW_VIEW,
} from '../../todos/today/today'
import { useModifierHeld } from '../../shortcuts/use-modifier-held'
import { useTheme } from '../../lib/use-theme'
import { ShortcutKeys } from '../../shortcuts/shortcut-keys/shortcut-keys'
import { SHORTCUTS } from '../../shortcuts/shortcuts/shortcuts'
import { ListItemMenu } from '../list-item-menu/list-item-menu'
import { colourVar, markerColor } from '../list-color/list-color'
import { type ListFilter, visibleLists } from '../list-filter/list-filter'
import { HiddenListsRow } from '../list-filter-menu/list-filter-menu'
import { listKindOf } from '../list-kind/list-kind'
import { reorder } from '../list-order/list-order'
import type { ListFormState } from '../use-list-form'
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
/**
 * How each derived view is drawn in the nav.
 *
 * Keyed by view id so the rows are rendered *from* DERIVED_VIEWS
 * (todos/today.ts) rather than written out one by one: that list decides
 * both the order and the `Ctrl+Shift+<n>` chords, so a view added there
 * should appear here without touching the markup below.
 * *(added 2026-08-04.)*
 */
const VIEW_META: Record<string, { label: string; icon: IconType }> = {
  [TODAY_VIEW]: { label: 'Today', icon: LuSun },
  // A sunrise for the day not yet begun, against Today's full sun — the
  // two read as a sequence at a glance, and both come from the same set
  // (CLAUDE.md — one icon collection). *(added 2026-08-05.)*
  [TOMORROW_VIEW]: { label: 'Tomorrow', icon: LuSunrise },
  [SUMMARY_VIEW]: { label: 'Summary', icon: LuHistory },
  // The magnifier, which is the one icon in this set nobody has to learn.
  // *(added 2026-08-06, issue #6.)*
  [SEARCH_VIEW]: { label: 'Search', icon: LuSearch },
}

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
  /**
   * docs/specs/list-filter.md — which lists are hidden, so the nav can
   * leave them out. The trigger itself is an icon button in the nav's
   * title row (main-screen.tsx); only the "N lists hidden" row belongs
   * here, with the lists it is counting.
   */
  filter: ListFilter
  /**
   * Ask to unhide them all. MainScreen owns that confirm even though the
   * row lives here: on mobile this component renders inside the drawer's
   * Dialog, where a nested dialog gets no backdrop of its own — the same
   * trap the list forms are hoisted out of.
   */
  onRevealLists: () => void
}) {
  const lists = useLists()
  const theme = useTheme()
  const { mutate } = props.form
  // docs/specs/ui.md — keyboard shortcuts: the chords are hints, not
  // labels. Five permanent keycaps is a lot of chrome on a page whose
  // point is restraint, so they stay hidden until you hold Ctrl — the
  // moment you are asking the question — or hover the row they belong to.
  // *(added 2026-08-04.)*
  const modifierHeld = useModifierHeld()

  // docs/specs/lists.md — reordering writes only the lists that moved:
  // swapping two adjacent lists swaps two numbers, rather than renumbering
  // the whole nav. `reorder` reads the *current* cache rather than the
  // half-updated one, so both changes are computed before either is
  // applied; each then goes through `mutate`, whose setQueryData callback
  // reads the latest cache and so builds on its predecessor.
  const allLists = lists.data ?? []
  // docs/specs/list-filter.md — a hidden list leaves the nav too. That is
  // the point rather than a side effect: filtering the views while leaving
  // "Therapy" legible in the sidebar defeats the whole purpose during a
  // screenshare. *(added 2026-08-05.)*
  const shownLists = visibleLists(allLists, props.filter)

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
            <span
              className={styles['navKey']}
              data-revealed={modifierHeld || undefined}
            >
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
            <span
              className={styles['navKey']}
              data-revealed={modifierHeld || undefined}
            >
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
      {/* Every row in the nav is one button and nothing else. The info
          badges that explained these two views used to hang off them,
          which made Today and Summary the only rows with a second control
          in them — the rhythm broke exactly where the nav is meant to read
          as a plain list of places to go. The explanation now sits beside
          the view's own title in the content header (main-screen.tsx),
          where you are already looking when you wonder what the view is.
          *(moved 2026-08-04.)* */}
      <div className={styles['views']}>
        {DERIVED_VIEWS.map((view, index) => {
          const meta = VIEW_META[view]
          if (!meta) return null
          const Icon = meta.icon
          // The nth view's chord, by the same 1-based index the map uses
          // (shortcuts.ts — VIEW_SHORTCUTS). Looked up rather than
          // assumed, so a view beyond the ninth simply shows no hint.
          const shortcut = SHORTCUTS.find(
            (entry) => entry.action === `go-view:${index + 1}`,
          )
          return (
            <button
              key={view}
              type="button"
              className={cx(
                styles['today'],
                props.selected === view && styles['todayActive'],
              )}
              onClick={() => props.onSelect(view)}
            >
              <Icon aria-hidden="true" size={16} />
              {meta.label}
              {shortcut && (
                <span
                  className={styles['navKey']}
                  data-revealed={modifierHeld || undefined}
                >
                  <ShortcutKeys shortcut={shortcut} />
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* The one real division in the nav: views of your todos above, the
          lists they live in below. A short centred rule rather than space
          alone, since the gap between groups was doing the same job as
          the gap between rows. *(added 2026-08-04.)* */}
      <hr className={styles['separator']} />

      <ul>
        {shownLists.map((list) => (
          <li
            key={list.id}
            className={cx(
              styles['item'],
              list.id === props.selected && styles['itemActive'],
            )}
            // The marker is drawn by `.itemActive::before` over the row's
            // left edge, so this only has to supply its colour. A custom
            // property rather than a border colour: reserving a 4px border
            // on every row to keep the active one from reflowing made the
            // inactive rows visibly lopsided.
            // *(changed 2026-08-04.)*
            style={
              list.id === props.selected
                ? colourVar(markerColor(list.color, theme))
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
                // The colour goes to a custom property, not `background`:
                // the dot is painted by `.dot::after` at 8px inside a
                // 16px footprint, and a background on this box would fill
                // the whole footprint instead.
                // *(changed 2026-08-04.)*
                style={
                  list.color !== undefined ? colourVar(list.color) : undefined
                }
                aria-hidden="true"
              />
              {list.displayName}
              {/* docs/specs/list-kinds.md — the sparkle, as a bare glyph
                  with no popover. Every nav row is one button and nothing
                  else, which is why the derived views' info badges moved
                  out of here in the first place *(2026-08-04)*; a second
                  interactive control in a list row would undo that. This
                  marks the list, and the badge beside the list's own
                  title explains it (main-screen.tsx).
                  *(added 2026-08-05, issue #27.)* */}
              {listKindOf(list.displayName) && (
                <LuSparkles
                  className={styles['sparkle']}
                  aria-hidden="true"
                  size={14}
                />
              )}
            </button>
            <ListItemMenu
              displayName={list.displayName}
              // Position among *all* lists, not among the visible ones:
              // `reorder` swaps with the immediate neighbour in the full
              // nav (list-order.ts), so a list at the top of the filtered
              // view may still have hidden lists above it — and offering
              // "Move up" there would swap it with a row nobody can see.
              // *(added 2026-08-05.)*
              canMoveUp={allLists.indexOf(list) > 0}
              canMoveDown={allLists.indexOf(list) < allLists.length - 1}
              onMoveUp={() => move(list.id, 'up')}
              onMoveDown={() => move(list.id, 'down')}
              onEdit={() => props.form.openEdit(list)}
              onDelete={() => props.form.openDelete(list)}
            />
          </li>
        ))}
      </ul>

      {/* docs/specs/list-filter.md — what the filter is hiding, right
          where the hidden rows would have been. *(added 2026-08-05.)* */}
      <HiddenListsRow
        lists={allLists}
        filter={props.filter}
        onReveal={props.onRevealLists}
      />

      {/* No modals here. The create/edit/delete surfaces are rendered by
          MainScreen as siblings of the drawer — see the note on this
          component and `lists/use-list-form.ts`. */}
    </nav>
  )
}
