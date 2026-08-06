import type { Todo } from '@fold/schemas'
import { useState } from 'react'
import { LuCalendarClock, LuListChecks } from 'react-icons/lu'
import { ConfirmDialog } from '../../ui/confirm/confirm'
import { fieldsToDue } from '../../todos/due-fields/due-fields'
import { useTodoActions } from '../../todos/use-todo-actions'
import { featuresOf } from '../list-kind/list-kind'
import styles from './bulk-actions.module.css'

/**
 * The whole-list actions a kind unlocks (docs/specs/list-kinds.md — bulk
 * complete, bulk schedule).
 *
 * **Not a selection model.** There is no multi-select anywhere in Fold and
 * this needs none: the case is "I have done the shopping", where the
 * answer is the whole list rather than a subset of it. That is also why
 * these live in the list header rather than on the rows — they are about
 * the list, not about any todo in it.
 *
 * Both go through the ordinary optimistic write path, one `updateTodo`
 * per todo (docs/specs/sync-and-offline.md). No bulk mutation kind: the
 * outbox already coalesces and retries these, and a new kind would need
 * its own conflict handling for no benefit.
 */
export function BulkActions(props: {
  listId: string
  listName: string
  /** Active todos only — the rows these actions would touch. */
  active: readonly Todo[]
}) {
  const actions = useTodoActions(props.listId)
  const [confirming, setConfirming] = useState<'complete' | 'schedule' | null>(
    null,
  )
  // Defaults to today, the overwhelmingly common answer for "when is this
  // lot due" — and the field is right there to change.
  const [date, setDate] = useState('')

  const features = featuresOf(props.listName)
  const count = props.active.length

  // A list with no kind has no whole-list actions at all, so there is
  // nothing to render. A list *with* a kind always shows its buttons —
  // see `disabled` below.
  if (!features.bulkComplete && !features.bulkSchedule) return null

  // Shown but inert when there is nothing outstanding, rather than
  // disappearing. A control that vanishes takes the header's height with
  // it, so ticking off the last todo made the whole list jump; and a
  // recognised list should look the same whether or not you happen to be
  // caught up — the buttons are part of what the list *is*.
  // *(changed 2026-08-05: rendered nothing at zero.)*
  const disabled = count === 0

  const completeAll = (): void => {
    for (const todo of props.active) actions.update(todo, { completed: true })
  }

  const scheduleAll = (): void => {
    const due = fieldsToDue({ date, time: '' })
    // `fieldsToDue` returns undefined for an invalid pair; only a real
    // all-day date should ever reach here, since the button is disabled
    // without one.
    if (!due) return
    for (const todo of props.active) actions.update(todo, { due })
  }

  return (
    <div className={styles['actions']}>
      {features.bulkComplete && (
        <button
          type="button"
          className={styles['action']}
          disabled={disabled}
          onClick={() => setConfirming('complete')}
        >
          <LuListChecks aria-hidden="true" size={14} />
          Complete all
        </button>
      )}
      {features.bulkSchedule && (
        <button
          type="button"
          className={styles['action']}
          disabled={disabled}
          onClick={() => {
            setDate(todayFieldValue())
            setConfirming('schedule')
          }}
        >
          <LuCalendarClock aria-hidden="true" size={14} />
          Schedule all
        </button>
      )}

      {/* An unbounded change asks first — the count is in the question
          because "complete all" reads very differently at 3 todos and at
          30. But it asks in green, not red: nothing is destroyed and each
          todo can be set back one at a time, and spending Delete's red on
          a reversible action is what makes that red stop working where it
          matters (see ConfirmDialog's `tone`).
          *(changed 2026-08-05.)* */}
      <ConfirmDialog
        open={confirming === 'complete'}
        title={`Complete all ${count} todos?`}
        confirmLabel="Complete them"
        tone="affirmative"
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          setConfirming(null)
          completeAll()
        }}
      >
        <p>
          Every todo still open in <strong>{props.listName}</strong> will be
          ticked off. You can untick them individually afterwards.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirming === 'schedule'}
        title={`Give all ${count} todos a due date?`}
        confirmLabel="Set the date"
        tone="affirmative"
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          setConfirming(null)
          scheduleAll()
        }}
      >
        <p>
          Every todo still open in <strong>{props.listName}</strong> will be due
          on this date, replacing any date it already has.
        </p>
        <label className={styles['field']}>
          <span className={styles['label']}>Due date</span>
          <input
            type="date"
            className={styles['input']}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
      </ConfirmDialog>
    </div>
  )
}

const pad = (value: number): string => String(value).padStart(2, '0')

/** Today as a `yyyy-mm-dd` input value, in the viewer's own day. */
function todayFieldValue(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
