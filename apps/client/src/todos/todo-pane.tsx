import { Collapsible } from '@base-ui/react/collapsible'
import type { Todo, TodosResponse } from '@fold/schemas'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { LuChevronRight } from 'react-icons/lu'
import { api, queryClient, useSyncEngine } from '../providers'
import { useSound } from '../sound/use-sound'
import { cx } from '../styles/cx'
import { AddTodoTrigger } from './add-todo-trigger'
import { sortActiveTodos } from './sort'
import { TodoItem } from './todo-item'
import styles from './todo-pane.module.css'
import type { useAddTodo } from './use-add-todo'

export function TodoPane(props: {
  listId: string
  add: ReturnType<typeof useAddTodo>
  // docs/specs/ui.md — the detail panel: selection lives in MainScreen so
  // the panel can render as a layout column beside `<main>` rather than
  // inside it. This pane only reports which todo was opened, and from
  // which row, so focus can return there on close (issue #4).
  // *(changed 2026-08-03: was local `openUid` state plus a TodoDetail
  // rendered here.)*
  onOpen: (todo: Todo, trigger: HTMLElement | null) => void
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
  const [showCompleted, setShowCompleted] = useState(false)

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
            onOpen={(trigger) => props.onOpen(todo, trigger)}
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
                  onOpen={(trigger) => props.onOpen(todo, trigger)}
                />
              ))}
            </ul>
            {/* docs/specs/todos.md — clearing completed todos: there is no
                bulk delete. A completed todo carries the only record that
                the work was done (its COMPLETED stamp, which the Summary
                view groups by day), so wiping a list's completed section
                destroys history rather than tidying it. Individual todos
                can still be deleted from the detail sheet.
                *(removed 2026-08-02.)* */}
          </Collapsible.Panel>
        </Collapsible.Root>
      )}
    </div>
  )
}
