import { useRef, useState } from 'react'
import { useTodoActions } from './use-todo-actions'

// docs/specs/ui.md — scrolling: "Add a todo" sits outside the scroll
// container, alongside the list title — always reachable, never scrolled
// away. That means its trigger button and modal must live in the *sticky*
// part of the content column (main-screen.tsx's `.header`), not inside
// TodoPane's own scrolling body. This hook is the seam: MainScreen renders
// <AddTodoTrigger /> in its sticky header and <TodoPane /> in the scrolling
// region below, both driven by the same per-list todo actions.
// `listName` rides along because the list's *name* decides which fields
// the form shows — a media list has no due date (docs/specs/list-kinds.md)
// — and the trigger is the only thing between here and the modal.
// *(added 2026-08-05, issue #27.)*
export function useAddTodo(listId: string, listName = '') {
  const actions = useTodoActions(listId)
  const [addOpen, setAddOpen] = useState(false)
  const addTriggerRef = useRef<HTMLButtonElement>(null)
  return { actions, addOpen, setAddOpen, addTriggerRef, listName }
}
