import type { Todo, TodosResponse } from '@caldav-todo/schemas'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { ConfirmDialog } from '../confirm'
import { api, queryClient, useSyncEngine } from '../providers'
import { useSound } from '../sound/use-sound'
import { QuickAdd } from './quick-add'
import { sortActiveTodos } from './sort'
import { TodoDetail } from './todo-detail'
import { TodoItem } from './todo-item'
import { useTodoActions } from './use-todo-actions'

export function TodoPane(props: { listId: string }) {
  const engine = useSyncEngine()
  const todos = useQuery({
    queryKey: ['todos', props.listId],
    // Pass the ctag from the last *raw server response* — never the
    // reconciled cache the UI reads, which already has queued mutations
    // baked in. Reconciling on top of an already-reconciled value would
    // double-apply every still-queued mutation (e.g. a createTodo
    // placeholder appended again) on each subsequent 304/refetch —
    // docs/specs/sync-and-offline.md.
    queryFn: async () => {
      const rawKey = ['todos', props.listId, 'raw'] as const
      const rawPrevious = queryClient.getQueryData<TodosResponse>(rawKey)
      const fresh = await api.getTodos(
        props.listId,
        rawPrevious?.ctag ? rawPrevious.ctag : undefined,
      )
      const result = fresh ?? rawPrevious ?? { ctag: '', todos: [] }
      queryClient.setQueryData(rawKey, result)
      // A refetch must never override a pending local change — re-apply
      // whatever is still queued for this list on top of server data
      // before it reaches the UI.
      return engine.reconcileTodos(props.listId, result)
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
