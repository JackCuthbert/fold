import { Collapsible } from '@base-ui/react/collapsible'
import type { Todo, TodosResponse } from '@fold/schemas'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { LuChevronRight } from 'react-icons/lu'
import { ConfirmDialog } from '../confirm'
import { api, queryClient, useSyncEngine } from '../providers'
import { useSound } from '../sound/use-sound'
import { cx } from '../styles/cx'
import { AddTodoTrigger } from './add-todo-trigger'
import { sortActiveTodos } from './sort'
import { TodoDetail } from './todo-detail'
import { TodoItem } from './todo-item'
import styles from './todo-pane.module.css'
import type { useAddTodo } from './use-add-todo'

export function TodoPane(props: {
  listId: string
  add: ReturnType<typeof useAddTodo>
}) {
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
  const { actions } = props.add
  const { playPop } = useSound()
  const [openUid, setOpenUid] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  // docs/specs/todos.md — ordering: sorting happens here, on read, so the
  // list is always in sorted order — including the moment a todo is created.
  // The optimistic placeholder is appended to the cache (sync/optimistic.ts)
  // and this sort immediately places it, so a new todo appears directly in
  // its final position rather than landing at the bottom and jumping.
  // `now` is captured once per render so every comparison in one pass shares
  // a single instant. *(clarified 2026-08-01.)*
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
    <div className={styles['pane']}>
      {/* docs/specs/ui.md — the add-todo ghost row sits with the list, as
          its last row, scrolling with it: it is content, not a toolbar. */}
      <ul className={styles['list']}>
        {active.map((todo) => (
          <TodoItem
            key={todo.uid}
            todo={todo}
            now={now}
            onToggle={() => toggle(todo)}
            onOpen={() => setOpenUid(todo.uid)}
          />
        ))}
        <AddTodoTrigger {...props.add} />
      </ul>
      {/* No empty-state copy: the "Add a todo" ghost row is always the
          list's last child, so an empty list already reads as an invitation
          to add something rather than as a blank pane. A message beneath it
          only repeated what the row says. *(removed 2026-08-01.)* */}

      {completed.length > 0 && (
        <Collapsible.Root
          className={cx(styles['completed'])}
          open={showCompleted}
          onOpenChange={setShowCompleted}
          render={<section />}
        >
          <Collapsible.Trigger className={cx(styles['completedToggle'])}>
            <LuChevronRight
              className={styles['chevron']}
              aria-hidden="true"
              size={14}
            />
            Completed ({completed.length})
          </Collapsible.Trigger>
          <Collapsible.Panel>
            <ul className={cx(styles['list'], styles['completedList'])}>
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
              className={styles['clear']}
              onClick={() => setConfirmClear(true)}
            >
              Clear completed
            </button>
          </Collapsible.Panel>
        </Collapsible.Root>
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
