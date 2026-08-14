import { useListFilter } from '../../shell/context/list-filter-context'
import { useGlobalAddTodo } from '../hooks/use-global-add-todo'
import { QuickAddModal } from '../quick-add-modal/quick-add-modal'
import styles from './add-todo-trigger.module.css'
import type { useAddTodo } from '../hooks/use-add-todo'

// docs/specs/ui.md — "Add a todo" is a ghost row at the top of the list: it
// mirrors a todo row exactly (same height, same checkbox column, same left
// edge) but reads as a placeholder — italic, muted, with an inert check
// circle. The whole row is one button, so tapping the circle opens the
// modal like anywhere else on the row.
//
// The circle is drawn here rather than reusing <Checkbox> deliberately:
// Base UI's Checkbox.Root carries role="checkbox"/aria-checked and its own
// keyboard handling, which would announce a control that cannot be toggled.
// A plain aria-hidden SVG keeps the shape without the semantics.
//
// It opens quick add, the same surface the global path opens, with this
// pane's list preset — so the only difference between the two paths is
// whether the list starts filled in (docs/specs/quick-add.md). It used to
// open a separate multi-field form; that form was removed once quick add
// covered every field it had. *(changed 2026-08-14.)*
export function AddTodoTrigger(props: ReturnType<typeof useAddTodo>) {
  // From context rather than threaded through TodoPane: the list pill can
  // still be changed here, so quick add needs every list, and nothing
  // between here and MainScreen would otherwise mention them.
  const filter = useListFilter()
  // Not `props.actions.add`, which binds this pane's list at hook-call
  // time: the pill can be changed to another list, and a bound write would
  // then file the todo into the list you were looking at rather than the
  // one you picked. This one takes the id at submit time.
  const globalAdd = useGlobalAddTodo()
  return (
    <>
      <li className={styles['row']}>
        <button
          ref={props.addTriggerRef}
          type="button"
          className={styles['trigger']}
          onClick={() => props.setAddOpen(true)}
          // Named without the ellipsis. The visible "…" is a typographic
          // convention meaning "this opens something", not part of what the
          // control is called, and leaving it in the accessible name makes
          // the button announce as "Add a todo ellipsis".
          aria-label="Add a todo"
        >
          <span className={styles['circle']} aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10.5" />
            </svg>
          </span>
          <span className={styles['label']}>Add a todo…</span>
        </button>
      </li>
      <QuickAddModal
        open={props.addOpen}
        onOpenChange={props.setAddOpen}
        lists={filter.allLists}
        // In-list: this pane's list is the target, so the pill starts
        // filled and the line never has to name one.
        defaultListId={props.listId}
        onAdd={(listId, todo) => globalAdd.add(listId, todo)}
        triggerRef={props.addTriggerRef}
      />
    </>
  )
}
