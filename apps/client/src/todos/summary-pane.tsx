import type { TodoList } from '@fold/schemas'
import { useState } from 'react'
import { dayLabel, summariseCompleted } from './summary'
import styles from './summary-pane.module.css'
import { TodayDetail, TodayRow } from './today-pane'
import paneStyles from './todo-pane.module.css'
import { useTodayTodos } from './use-today-todos'

// docs/specs/summary-view.md — finished work, grouped by the day it was
// finished. Where Today looks forward (what is due), this looks back (what
// got done) — the answer to "what did I do yesterday?" before a standup.
//
// Reuses TodayRow/TodayDetail: both views draw todos from several lists at
// once, so both need each row bound to its *own* list's actions.
export function SummaryPane(props: { lists: readonly TodoList[] }) {
  const { todos } = useTodayTodos(props.lists)
  const [openUid, setOpenUid] = useState<string | null>(null)

  const now = new Date()
  const { days, undated } = summariseCompleted(todos)
  const open = todos.find((todo) => todo.uid === openUid)

  const listName = (listId: string): string =>
    props.lists.find((list) => list.id === listId)?.displayName ?? ''

  return (
    <div className={paneStyles['pane']}>
      {days.length === 0 && (
        <p className={styles['empty']}>
          Nothing completed yet. Finished todos will appear here, grouped by the
          day you finished them.
        </p>
      )}

      {days.map((group) => (
        <section key={group.day} className={styles['day']}>
          {/* A heading per day rather than a divider: this view is read by
              scanning for a date, so the date must be the loudest thing on
              the row (docs/specs/summary-view.md). */}
          <h2 className={styles['dayHeading']}>
            {dayLabel(group.day, now)}
            <span className={styles['dayCount']}>{group.todos.length}</span>
          </h2>
          <ul className={paneStyles['list']}>
            {group.todos.map((todo) => (
              <TodayRow
                key={todo.uid}
                todo={todo}
                now={now}
                listName={listName(todo.listId)}
                onOpen={() => setOpenUid(todo.uid)}
              />
            ))}
          </ul>
        </section>
      ))}

      {/* docs/specs/summary-view.md — a completed todo with no COMPLETED
          stamp can't be placed on a day. Say so rather than under-report
          silently. */}
      {undated > 0 && (
        <p className={styles['undated']}>
          {undated} completed {undated === 1 ? 'todo has' : 'todos have'} no
          completion date, so {undated === 1 ? "it isn't" : "they aren't"} shown
          above.
        </p>
      )}

      {open && (
        <TodayDetail
          todo={open}
          lists={props.lists}
          onClose={() => setOpenUid(null)}
        />
      )}
    </div>
  )
}
