import type { TodoList } from '@fold/schemas'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { LuHistory, LuPlus, LuSun } from 'react-icons/lu'
import { ConfirmDialog } from '../confirm'
import { api, queryClient, useSyncEngine } from '../providers'
import { cx } from '../styles/cx'
import {
  isSummaryView,
  isTodayView,
  SUMMARY_VIEW,
  TODAY_VIEW,
} from '../todos/today'
import { applyMutationToLists } from '../sync/optimistic'
import { useTheme } from '../use-theme'
import { ListFormModal } from './list-form-modal'
import { ListItemMenu } from './list-item-menu'
import { markerColor } from './list-color'
import { nextOrder, reorder } from './list-order'
import styles from './list-nav.module.css'

const slug = (): string => crypto.randomUUID()

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

// docs/specs/lists.md — discover/create/rename/delete.
export function ListNav(props: {
  selected: string | null
  onSelect: (listId: string) => void
}) {
  const engine = useSyncEngine()
  const lists = useLists()
  const theme = useTheme()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<TodoList | null>(null)
  const [deleting, setDeleting] = useState<TodoList | null>(null)

  const mutate = (
    mutation: Parameters<typeof applyMutationToLists>[1],
  ): void => {
    queryClient.setQueryData<TodoList[]>(['lists'], (current) =>
      applyMutationToLists(current ?? [], mutation),
    )
    void engine.enqueue(mutation)
  }

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
      {/* docs/specs/today-view.md, docs/specs/summary-view.md — derived
          views pinned above the real lists, and visually distinct from
          them: ghost buttons (link appearance only, unlike every other
          control in the nav), set off as a group by space rather than a
          divider, with no kebab menu because there is nothing on the
          server to rename or delete. */}
      <div className={styles['views']}>
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
      </div>

      <ul>
        {(lists.data ?? []).map((list, index, all) => (
          <li key={list.id} className={styles['item']}>
            <button
              type="button"
              className={
                list.id === props.selected
                  ? `${styles['link']} ${styles['linkActive']}`
                  : styles['link']
              }
              style={
                list.id === props.selected
                  ? { borderLeftColor: markerColor(list.color, theme) }
                  : undefined
              }
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
              onEdit={() => setEditing(list)}
              onDelete={() => setDeleting(list)}
            />
          </li>
        ))}
      </ul>

      {/* docs/specs/ui.md — one left edge, including controls: a literal
          "+ " prefix is text, so it sat at the label's inset rather than
          on the icon column every other nav row aligns to. A real icon
          lines up with Settings' gear. The accessible name keeps the
          "+ New list" wording the e2e suite matches on. */}
      <button
        type="button"
        className={styles['add']}
        aria-label="+ New list"
        onClick={() => setCreating(true)}
      >
        <LuPlus aria-hidden="true" size={16} />
        New list
      </button>

      <ListFormModal
        open={creating}
        title="New list"
        submitLabel="Create"
        onOpenChange={setCreating}
        onSubmit={(values) => {
          const listId = slug()
          mutate({
            id: crypto.randomUUID(),
            kind: 'createList',
            listId,
            displayName: values.displayName,
            // docs/specs/lists.md — the client picks the order so the new
            // list can't jump when the server responds.
            order: nextOrder(lists.data ?? []),
            ...(values.color !== undefined ? { color: values.color } : {}),
          })
          setCreating(false)
          props.onSelect(listId)
        }}
      />

      <ListFormModal
        open={editing !== null}
        title="Edit list"
        {...(editing
          ? {
              initial: {
                displayName: editing.displayName,
                ...(editing.color !== undefined
                  ? { color: editing.color }
                  : {}),
              },
            }
          : {})}
        submitLabel="Save"
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        // docs/specs/lists.md — colours. One form, but up to two mutations,
        // and only for what actually changed: a name-only edit must not
        // cost a PROPPATCH of the colour, or vice versa.
        onSubmit={(values) => {
          if (!editing) return
          if (values.displayName !== editing.displayName) {
            mutate({
              id: crypto.randomUUID(),
              kind: 'renameList',
              listId: editing.id,
              displayName: values.displayName,
            })
          }
          if (values.color !== editing.color) {
            mutate({
              id: crypto.randomUUID(),
              kind: 'setListProps',
              listId: editing.id,
              // The form uses undefined for "no colour"; the mutation uses
              // null for "remove the property". Translate at this boundary.
              color: values.color ?? null,
            })
          }
          setEditing(null)
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete "${deleting?.displayName ?? ''}"?`}
        confirmLabel="Delete list"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return
          mutate({
            id: crypto.randomUUID(),
            kind: 'deleteList',
            listId: deleting.id,
          })
          setDeleting(null)
        }}
      >
        <p>This deletes the list and all its todos from the server.</p>
      </ConfirmDialog>
    </nav>
  )
}
