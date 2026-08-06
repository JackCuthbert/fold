import type { Todo, TodoList } from '@fold/schemas'
import { useEffect, useRef } from 'react'
import { LuSearch } from 'react-icons/lu'
import { useSound } from '../sound/use-sound'
import { isSearchable, MIN_QUERY_LENGTH, searchTodos } from './search'
import styles from './search-pane.module.css'
import { TodayRow } from './today-pane'
import paneStyles from './todo-pane.module.css'
import { useTodayTodos } from './use-today-todos'

// docs/specs/search-view.md — fuzzy text search over every todo, from every
// list. A derived view like Today and Summary, and it reads from the same
// fan-out (use-today-todos.ts), so it costs no request of its own.
//
// Reuses TodayRow for the same reason Summary does: results come from
// several lists at once, so each row has to bind its own list's actions.
export function SearchPane(props: {
  lists: readonly TodoList[]
  /**
   * The query, owned by MainScreen.
   *
   * Hoisted for the reason the detail form is (use-todo-detail-form.ts):
   * this pane is inside `<main>`, which is rendered by two different trees
   * either side of the 768px breakpoint, so state owned here is destroyed
   * by a resize — a half-typed query lost to turning a phone sideways.
   */
  query: string
  onQueryChange: (query: string) => void
  // Selection lives in MainScreen — see TodoPane's `onOpen`
  // (docs/specs/ui.md — the detail panel; issue #4).
  onOpen: (todo: Todo, trigger: HTMLElement | null) => void
}) {
  const { todos } = useTodayTodos(props.lists)
  const { playPop } = useSound()
  const field = useRef<HTMLInputElement | null>(null)

  // Focus the field on arrival. Landing on a search view and having to
  // click before typing is the one obvious way to get this wrong — you
  // came here to type. Runs once per mount, and the pane is keyed by view
  // in MainScreen, so switching away and back re-focuses.
  useEffect(() => {
    field.current?.focus()
  }, [])

  // No grouping here, deliberately, unlike Today and Summary
  // (docs/specs/list-kinds.md). Grouping collapses a list's todos into one
  // row, which is right when you are scanning a day — eight things to buy
  // is one errand — and wrong when you are searching: you asked for a
  // specific todo by name, and hiding it inside a "Groceries (8)" row
  // would answer a question you did not ask. Every match is its own row.
  const results = searchTodos(todos, props.query)
  const searched = isSearchable(props.query)

  const listName = (listId: string): string =>
    props.lists.find((list) => list.id === listId)?.displayName ?? ''

  return (
    <div className={paneStyles['pane']}>
      {/* A plain label rather than a placeholder-as-label: a placeholder
          disappears the moment you type, and is not an accessible name
          (docs/specs/ui.md — accessibility). Visually hidden because the
          magnifier and the view's own title already say what this is. */}
      <div className={styles['fieldRow']}>
        <LuSearch
          className={styles['fieldIcon']}
          aria-hidden="true"
          size={16}
        />
        <input
          ref={field}
          type="search"
          className={styles['field']}
          // `search` inputs get a native clear button in Chrome and Safari,
          // which is exactly the affordance wanted here — no hand-rolled ✕.
          aria-label="Search todos"
          placeholder="Search every list…"
          value={props.query}
          onChange={(event) => props.onQueryChange(event.target.value)}
        />
      </div>

      {/* Three states, and they are genuinely different questions: you have
          not asked yet, you asked and nothing matched, or here are the
          results. The first is not an empty state — saying "No todos" over
          an untouched field would be answering a question nobody put.

          This is the one derived view that *does* carry empty-state copy,
          against the call made for Today, Tomorrow and Summary. Those have
          a title and a count line that already say it; here the count line
          is deliberately silent until a search has run, and "nothing
          matched 'xyz'" is information the title cannot carry. */}
      {!searched ? (
        <p className={styles['hint']}>
          {props.query.trim().length === 0
            ? 'Type to search across every list, including finished todos.'
            : `Keep typing — searches start at ${MIN_QUERY_LENGTH} characters.`}
        </p>
      ) : results.length === 0 ? (
        <p className={styles['hint']}>
          Nothing matched <strong>{props.query.trim()}</strong>.
        </p>
      ) : (
        <ul className={paneStyles['list']}>
          {results.map((todo) => (
            <TodayRow
              key={`${todo.listId}:${todo.uid}`}
              todo={todo}
              now={new Date()}
              listName={listName(todo.listId)}
              onOpen={(trigger) => props.onOpen(todo, trigger)}
              onToggled={playPop}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
