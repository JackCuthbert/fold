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
import { ListFormModal } from './list-form-modal'
import { ListItemMenu } from './list-item-menu'
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
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<TodoList | null>(null)
  const [deleting, setDeleting] = useState<TodoList | null>(null)

  const mutate = (
    mutation: Parameters<typeof applyMutationToLists>[1],
  ): void => {
    queryClient.setQueryData<TodoList[]>(['lists'], (current) =>
      applyMutationToLists(current ?? [], mutation),
    )
    void engine.enqueue(mutation)
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
        {(lists.data ?? []).map((list) => (
          <li key={list.id} className={styles['item']}>
            <button
              type="button"
              className={
                list.id === props.selected
                  ? `${styles['link']} ${styles['linkActive']}`
                  : styles['link']
              }
              onClick={() => props.onSelect(list.id)}
            >
              {list.displayName}
            </button>
            <ListItemMenu
              displayName={list.displayName}
              onRename={() => setRenaming(list)}
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
        onSubmit={(displayName) => {
          const listId = slug()
          mutate({
            id: crypto.randomUUID(),
            kind: 'createList',
            listId,
            displayName,
          })
          setCreating(false)
          props.onSelect(listId)
        }}
      />

      <ListFormModal
        open={renaming !== null}
        title="Rename list"
        {...(renaming ? { initial: renaming.displayName } : {})}
        submitLabel="Rename"
        onOpenChange={(open) => {
          if (!open) setRenaming(null)
        }}
        onSubmit={(displayName) => {
          if (!renaming) return
          mutate({
            id: crypto.randomUUID(),
            kind: 'renameList',
            listId: renaming.id,
            displayName,
          })
          setRenaming(null)
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
