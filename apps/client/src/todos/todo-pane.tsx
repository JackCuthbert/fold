import type { Todo, TodosResponse } from '@caldav-todo/schemas'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { ConfirmDialog } from '../confirm'
import { api, queryClient } from '../providers'
import { useSound } from '../sound/use-sound'
import { QuickAdd } from './quick-add'
import { sortActiveTodos } from './sort'
import { TodoDetail } from './todo-detail'
import { TodoItem } from './todo-item'
import { useTodoActions } from './use-todo-actions'

export function TodoPane(props: { listId: string }) {
  const todos = useQuery({
    queryKey: ['todos', props.listId],
    // Pass the cached ctag; a 304 keeps the cached copy —
    // docs/specs/caldav-compliance.md (ctag short-circuit).
    queryFn: async () => {
      const previous = queryClient.getQueryData<TodosResponse>([
        'todos',
        props.listId,
      ])
      const fresh = await api.getTodos(
        props.listId,
        previous?.ctag ? previous.ctag : undefined,
      )
      return fresh ?? previous ?? { ctag: '', todos: [] }
    },
  })
  const actions = useTodoActions(props.listId)
  const { playPop } = useSound()
  const [openUid, setOpenUid] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  const now = new Date()
  const all = todos.data?.todos ?? []
  const active = sortActiveTodos(
    all.filter((todo) => !todo.completed),
    now,
  )
  const completed = all.filter((todo) => todo.completed)
  const open = all.find((todo) => todo.uid === openUid)

  const toggle = (todo: Todo): void => {
    actions.update(todo, { completed: !todo.completed })
    if (!todo.completed) playPop()
  }

  return (
    <div className="pane">
      <QuickAdd
        onAdd={(summary) => actions.add({ uid: crypto.randomUUID(), summary })}
      />
      <ul className="todos">
        {active.map((todo) => (
          <TodoItem
            key={todo.uid}
            todo={todo}
            now={now}
            onToggle={() => toggle(todo)}
            onOpen={() => setOpenUid(todo.uid)}
          />
        ))}
      </ul>
      {active.length === 0 && completed.length === 0 && (
        <p className="empty">Nothing to do. Savor it.</p>
      )}

      {completed.length > 0 && (
        <section className="completed">
          <button
            type="button"
            className="completed__toggle"
            aria-expanded={showCompleted}
            onClick={() => setShowCompleted((value) => !value)}
          >
            Completed ({completed.length})
          </button>
          {showCompleted && (
            <>
              <ul className="todos todos--completed">
                {completed.map((todo) => (
                  <TodoItem
                    key={todo.uid}
                    todo={todo}
                    now={now}
                    onToggle={() => toggle(todo)}
                    onOpen={() => setOpenUid(todo.uid)}
                  />
                ))}
              </ul>
              <button
                type="button"
                className="completed__clear"
                onClick={() => setConfirmClear(true)}
              >
                Clear completed
              </button>
            </>
          )}
        </section>
      )}

      {open && (
        <TodoDetail
          todo={open}
          onSave={(changes) => actions.update(open, changes)}
          onDelete={() => {
            actions.remove(open)
            setOpenUid(null)
          }}
          onClose={() => setOpenUid(null)}
        />
      )}

      <ConfirmDialog
        open={confirmClear}
        title="Clear completed?"
        confirmLabel={`Delete ${completed.length}`}
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          for (const todo of completed) actions.remove(todo)
          setConfirmClear(false)
        }}
      >
        <p>Deletes {completed.length} completed todos from the server.</p>
      </ConfirmDialog>
    </div>
  )
}
