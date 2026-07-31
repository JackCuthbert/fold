import { LuPlus } from 'react-icons/lu'
import { AddTodoModal } from './add-todo-modal'
import styles from './add-todo-trigger.module.css'
import type { useAddTodo } from './use-add-todo'

// docs/specs/ui.md — scrolling: "Add a todo" sits outside the scroll
// container, alongside the title — rendered by MainScreen inside its sticky
// `.header`, never inside TodoPane's own scrolling body. Its state
// (use-add-todo.ts) is created once by MainScreen and shared with TodoPane
// so the modal's `onAdd` still reaches the same per-list todo actions.
export function AddTodoTrigger(props: ReturnType<typeof useAddTodo>) {
  return (
    <>
      <button
        ref={props.addTriggerRef}
        type="button"
        className={styles['addTrigger']}
        onClick={() => props.setAddOpen(true)}
      >
        <LuPlus aria-hidden="true" size={16} />
        Add a todo
      </button>
      <AddTodoModal
        open={props.addOpen}
        onOpenChange={props.setAddOpen}
        onAdd={(todo) => props.actions.add(todo)}
        triggerRef={props.addTriggerRef}
      />
    </>
  )
}
