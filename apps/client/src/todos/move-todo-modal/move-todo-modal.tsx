import { Dialog } from '@base-ui/react/dialog'
import type { Todo, TodoList } from '@fold/schemas'
import { useRef } from 'react'
import { ModalHeader } from '../../ui'
import { cx } from '../../styles/cx'
import styles from './move-todo-modal.module.css'

export interface MoveTodoModalProps {
  open: boolean
  /** The todo being moved. Its own list is never offered as a target. */
  todo: Todo | null
  lists: readonly TodoList[]
  onOpenChange: (open: boolean) => void
  onMove: (targetListId: string) => void
}

/**
 * Move a todo to another list (docs/specs/todos.md — moving a todo between
 * lists).
 *
 * A deliberate action rather than a field in the edit form. Moving is not
 * editing a property: the resource is deleted from one collection and
 * recreated in another. As a `List` dropdown beside Priority it looked and
 * behaved exactly like changing the priority, so a stray tap sent the todo
 * out of the list you were reading (issue #38).
 *
 * **Targets are buttons, not a select plus a confirm.** The whole dialog is
 * the confirmation — opening it is the deliberate act, and once open there
 * is exactly one decision to make. A select would add a second step to
 * choose and a third to apply, for a list that is usually short enough to
 * show whole.
 *
 * The todo's current list is absent rather than disabled: moving a todo to
 * where it already is has no meaning, and offering it as an inert row
 * invites the question of what it would do.
 *
 * *(added 2026-08-09, issue #38.)*
 */
export function MoveTodoModal(props: MoveTodoModalProps) {
  // The last todo this was opened for, kept so the dialog still has one
  // while it animates *out*.
  //
  // The caller clears its `movingTodo` the moment a target is chosen, but
  // the dialog stays mounted for the length of its exit transition
  // (docs/specs/ui.md — overlays animate). With `props.todo` already null,
  // the filter below had nothing to exclude, so the list the todo was
  // being moved *from* reappeared in the list and then faded away with the
  // rest — a flash of the one option that must never be offered.
  //
  // Held here rather than by the caller, so every caller gets it: this is
  // a property of a dialog that outlives its subject, not of one screen.
  // The same shape as `lastSheetTodo` in shell/main-screen, for the same
  // reason. *(added 2026-08-11.)*
  const lastTodo = useRef(props.todo)
  if (props.todo) lastTodo.current = props.todo
  const todo = props.todo ?? lastTodo.current

  const targets = props.lists.filter((list) => list.id !== todo?.listId)

  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={cx(styles['backdrop'])} />
        <Dialog.Popup className={cx(styles['popup'])}>
          <ModalHeader>Move to…</ModalHeader>
          <div className={styles['body']}>
            {targets.length === 0 ? (
              // Reachable when every other list is gone by the time the
              // dialog opens. Says why there is nothing to pick rather
              // than showing an empty box.
              <p className={styles['empty']}>
                There is nowhere to move this todo — it is your only list.
              </p>
            ) : (
              <ul className={styles['targets']}>
                {targets.map((list) => (
                  <li key={list.id}>
                    <button
                      type="button"
                      className={styles['target']}
                      onClick={() => {
                        props.onMove(list.id)
                        props.onOpenChange(false)
                      }}
                    >
                      {/* The list's own colour, the same marker the nav
                          uses, so a list is recognised the same way
                          everywhere (docs/specs/lists.md — colours). An
                          uncoloured list gets the shared empty ring rather
                          than nothing, so every row keeps one left edge. */}
                      <span
                        className={cx(
                          styles['dot'],
                          list.color === undefined && styles['dotEmpty'],
                        )}
                        {...(list.color === undefined
                          ? {}
                          : { style: { background: list.color } })}
                        aria-hidden="true"
                      />
                      {list.displayName}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
