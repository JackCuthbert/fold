import { AddTodoModal } from './add-todo-modal'
import styles from './add-todo-trigger.module.css'
import type { useAddTodo } from './use-add-todo'

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
export function AddTodoTrigger(props: ReturnType<typeof useAddTodo>) {
  return (
    <>
      <li className={styles['row']}>
        <button
          ref={props.addTriggerRef}
          type="button"
          className={styles['trigger']}
          onClick={() => props.setAddOpen(true)}
        >
          <span className={styles['circle']} aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10.5" />
            </svg>
          </span>
          <span className={styles['label']}>Add a todo</span>
        </button>
      </li>
      <AddTodoModal
        open={props.addOpen}
        onOpenChange={props.setAddOpen}
        onAdd={(todo) => props.actions.add(todo)}
        triggerRef={props.addTriggerRef}
      />
    </>
  )
}
