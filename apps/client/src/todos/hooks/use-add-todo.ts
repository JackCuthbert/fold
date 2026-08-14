import { useRef, useState } from 'react'
import { useTodoActions } from './use-todo-actions'

// docs/specs/ui.md — scrolling: "Add a todo" sits outside the scroll
// container, alongside the list title — always reachable, never scrolled
// away. That means its trigger button and modal must live in the *sticky*
// part of the content column (main-screen.tsx's `.header`), not inside
// TodoPane's own scrolling body. This hook is the seam: MainScreen renders
// <AddTodoTrigger /> in its sticky header and <TodoPane /> in the scrolling
// region below, both driven by the same per-list todo actions.
// `listId` and `listName` both ride along: the id presets quick add's list
// pill so the in-list path never asks which list, and the *name* is what
// decides whether due dates apply at all — a media list has none
// (docs/specs/list-kinds.md). The trigger is the only thing between here
// and the modal. *(added 2026-08-05, issue #27; `listId` added 2026-08-14
// when the in-list path moved to quick add.)*
export function useAddTodo(listId: string, listName = '') {
  const actions = useTodoActions(listId)
  const [addOpen, setAddOpen] = useState(false)
  const addTriggerRef = useRef<HTMLButtonElement>(null)
  return { actions, addOpen, setAddOpen, addTriggerRef, listId, listName }
}
