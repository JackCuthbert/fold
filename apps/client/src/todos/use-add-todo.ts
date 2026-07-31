import { useRef, useState } from 'react'
import { useTodoActions } from './use-todo-actions'

// docs/specs/ui.md — scrolling: "Add a todo" sits outside the scroll
// container, alongside the list title — always reachable, never scrolled
// away. That means its trigger button and modal must live in the *sticky*
// part of the content column (main-screen.tsx's `.header`), not inside
// TodoPane's own scrolling body. This hook is the seam: MainScreen renders
// <AddTodoTrigger /> in its sticky header and <TodoPane /> in the scrolling
// region below, both driven by the same per-list todo actions.
export function useAddTodo(listId: string) {
  const actions = useTodoActions(listId)
  const [addOpen, setAddOpen] = useState(false)
  const addTriggerRef = useRef<HTMLButtonElement>(null)
  return { actions, addOpen, setAddOpen, addTriggerRef }
}
