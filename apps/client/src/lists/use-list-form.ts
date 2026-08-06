import type { TodoList } from '@fold/schemas'
import { useState } from 'react'
import { queryClient, useSyncEngine } from '../providers'
import { applyMutationToLists } from '../sync/optimistic/optimistic'
import type { ListFormValues } from './list-form/list-form'
import { nextOrder } from './list-order/list-order'

/**
 * Which list surface is open, and everything needed to submit it.
 *
 * Lifted out of `ListNav` for two reasons that turn out to be the same
 * reason (issues #20 and #21):
 *
 * - **Scrim.** On mobile the nav renders inside the drawer's
 *   `Dialog.Popup`, so a modal owned there is a *nested* dialog — and Base
 *   UI suppresses a nested dialog's backdrop by design. The New list modal
 *   re-used the drawer's scrim and appeared to float on the nav. Owned
 *   here, it renders as a sibling of the drawer and is top-level at every
 *   viewport — exactly the treatment Settings and Help already had.
 * - **State loss.** `ListNav` is rendered by two different trees either
 *   side of the 768px breakpoint, so crossing it unmounted the modal
 *   outright: a half-typed new list vanished, and reopening started over.
 *   `MainScreen` is mounted at every viewport, so state held here survives
 *   the crossing.
 *
 * Follows `todos/use-todo-detail-form.ts`, which solved the same shape for
 * the todo panel: state lives in a hook called by `MainScreen`, and the
 * surfaces become presentational.
 *
 * **A layout change is not a dismissal.** Closing the modal discards the
 * draft, deliberately — but resizing the window is not the user closing
 * anything, so an in-progress name and colour survive it. Same rule the
 * todo panel settled on.
 */
export type ListFormState = ReturnType<typeof useListForm>

export function useListForm(lists: readonly TodoList[]) {
  const engine = useSyncEngine()
  // `creating` and `editing` are separate rather than one tagged union: the
  // two modals differ in title, submit label and seeded values, and a
  // single "open" flag would need unpacking at every use anyway.
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

  return {
    creating,
    editing,
    deleting,
    /** Openers, handed down to the nav. */
    openCreate: () => setCreating(true),
    openEdit: (list: TodoList) => setEditing(list),
    openDelete: (list: TodoList) => setDeleting(list),
    setCreating,
    closeEdit: () => setEditing(null),
    closeDelete: () => setDeleting(null),
    mutate,
    /**
     * Create, returning the new list's id so the caller can select it.
     * The client picks the order so the new list can't jump when the
     * server responds (docs/specs/lists.md).
     */
    submitCreate: (values: ListFormValues): string => {
      const listId = crypto.randomUUID()
      mutate({
        id: crypto.randomUUID(),
        kind: 'createList',
        listId,
        displayName: values.displayName,
        order: nextOrder(lists),
        ...(values.color !== undefined ? { color: values.color } : {}),
      })
      setCreating(false)
      return listId
    },
    /**
     * docs/specs/lists.md — colours. One form, but up to two mutations, and
     * only for what actually changed: a name-only edit must not cost a
     * PROPPATCH of the colour, or vice versa.
     */
    submitEdit: (values: ListFormValues): void => {
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
    },
    confirmDelete: (): void => {
      if (!deleting) return
      mutate({
        id: crypto.randomUUID(),
        kind: 'deleteList',
        listId: deleting.id,
      })
      setDeleting(null)
    },
  }
}
