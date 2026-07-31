import type { TodoList } from '@caldav-todo/schemas'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { ConfirmDialog } from '../confirm'
import { api, queryClient, useSyncEngine } from '../providers'
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

      <button
        type="button"
        className={styles['add']}
        onClick={() => setCreating(true)}
      >
        + New list
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
