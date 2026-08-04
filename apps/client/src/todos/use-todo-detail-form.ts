import { todoPrioritySchema, type Todo, type TodoChanges } from '@fold/schemas'
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useRef, useState } from 'react'
import { useForm, type Control } from 'react-hook-form'
import { z } from 'zod'
import { dueToFields, fieldsToDue, type DueFields } from './due-fields'

// docs/specs/todos.md — due times: a time needs a date, since DUE cannot
// express one without the other.
export const detailSchema = z
  .object({
    summary: z.string().min(1),
    due: z.string(), // '' or yyyy-mm-dd from <input type="date">
    dueTime: z.string(), // '' or HH:mm from <input type="time">
    description: z.string(),
    priority: z.union([todoPrioritySchema, z.literal('')]),
    // The list the todo should end up in. Changing it moves the todo
    // (docs/specs/todos.md — moving a todo between lists).
    listId: z.string(),
  })
  .refine((values) => values.dueTime === '' || values.due !== '', {
    path: ['dueTime'],
    message: 'Pick a date for this time',
  })
export type DetailForm = z.infer<typeof detailSchema>

const defaultsFor = (todo: Todo, fields: DueFields): DetailForm => ({
  summary: todo.summary,
  due: fields.date,
  dueTime: fields.time,
  description: todo.description ?? '',
  priority: todo.priority ?? '',
  listId: todo.listId,
})

/** Seed values while no todo is open — never rendered, never submitted. */
const EMPTY_FORM: DetailForm = {
  summary: '',
  due: '',
  dueTime: '',
  description: '',
  priority: '',
  listId: '',
}

/**
 * Build the `TodoChanges` for one submission of the detail form.
 *
 * Pure, and separate from the hook, because the DUE rule below is the part
 * of this form most likely to break silently — it is worth testing without
 * a DOM (docs/specs/testing.md — test behavior, not shape).
 *
 * `initialFields` must be the fields the form was *opened* with, not
 * anything rebuilt from `todo.due` at submit time: see below.
 */
export function detailChanges(
  values: DetailForm,
  todo: Todo,
  initialFields: DueFields,
  timeZone?: string,
): TodoChanges {
  // Compare the *inputs*, not the rebuilt TodoDue. The two inputs can't
  // distinguish a floating value from a zoned one — both render as the
  // same date and time — so rebuilding an untouched floating DUE would
  // produce a zoned one and look like an edit. Comparing what the user
  // actually sees is what leaves a foreign client's floating/UTC value
  // byte-identical (docs/specs/caldav-compliance.md).
  const untouched =
    values.due === initialFields.date && values.dueTime === initialFields.time
  // `undefined` can't reach here — the schema rejects a time with no date.
  const nextDue =
    fieldsToDue({ date: values.due, time: values.dueTime }, timeZone) ??
    undefined
  return {
    ...(values.summary !== todo.summary ? { summary: values.summary } : {}),
    ...(untouched ? {} : { due: nextDue ?? null }),
    description: values.description === '' ? null : values.description,
    priority: values.priority === '' ? null : values.priority,
  }
}

/** What both detail surfaces need to render and submit the form. */
export interface TodoDetailForm {
  control: Control<DetailForm>
  /** True while the form differs from the todo's *stored* values. */
  isDirty: boolean
  /** Wraps react-hook-form's `handleSubmit` — pass straight to `onSubmit`. */
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  /**
   * Discard the edit in progress and restore the todo's stored values.
   * Backs the footer's Reset — see the implementation for why that button
   * is no longer a second Close.
   */
  revert: () => void
  /**
   * True while the open todo is completed and has not been unlocked —
   * every field is read-only (docs/specs/todos.md).
   */
  locked: boolean
  /** Deliberately allow editing this completed todo, for this opening. */
  unlock: () => void
}

/**
 * The detail form's state, hoisted out of the surface that renders it.
 *
 * docs/specs/ui.md — the detail panel: the panel is a layout column on
 * desktop and a modal bottom sheet on mobile, and those are two different
 * components in two different tree positions (one an inline child of
 * `.body`, the other portalled by `Dialog.Portal`). Crossing the breakpoint
 * unmounts one and mounts the other, so any form state owned *inside* them
 * is discarded — an unsaved edit vanished on resize. React cannot preserve
 * state across that move, so the state moves instead: this hook is called
 * by MainScreen, which stays mounted at every viewport, and both surfaces
 * render from the one form.
 * *(fixed 2026-08-03: the edit was lost when the layout changed.)*
 *
 * Call it unconditionally — pass `null` when no todo is open — so it obeys
 * the rules of hooks from a component that renders the panel conditionally.
 */
export function useTodoDetailForm(
  todo: Todo | null,
  handlers: {
    onSave: (changes: TodoChanges) => void
    onMove: (targetListId: string) => void
    onClose: () => void
  },
): TodoDetailForm {
  // The fields the *currently shown* todo was opened with. A ref, not
  // derived at submit time, because `submit` must compare against what the
  // user was first shown — see `detailChanges`.
  const initialFields = useRef<DueFields>(dueToFields(todo?.due))
  // Which todo those fields (and the form's values) belong to. Opening a
  // different todo has to re-derive both; previously a `key` on the surface
  // forced a remount to do it, but the form no longer lives there.
  const shownUid = useRef<string | null>(todo?.uid ?? null)
  // docs/specs/todos.md — a completed todo is read-only until unlocked.
  // Deliberately *not* persisted and reset whenever a different todo is
  // shown (see the effect below): a guard you can switch off once and
  // forget is not a guard. Lives here rather than in either surface so it
  // survives the mobile/desktop breakpoint along with the form state
  // (issue #25).
  const [unlocked, setUnlocked] = useState(false)

  const {
    control,
    handleSubmit,
    reset,
    formState: { isDirty },
  } = useForm<DetailForm>({
    resolver: zodResolver(detailSchema),
    defaultValues: todo ? defaultsFor(todo, initialFields.current) : EMPTY_FORM,
  })

  // Re-seed when the panel opens on a todo it is not already showing — the
  // replacement for the `key` remount the surfaces used to carry.
  //
  // Deliberately keyed on the uid, not on the todo object: the todo
  // re-renders on every optimistic cache write, and re-seeding on those
  // would throw away the edit in progress — the very thing this hook
  // exists to protect.
  //
  // Closing forgets which todo was shown, so *reopening the same one*
  // re-seeds from storage rather than resurrecting the abandoned edit.
  // Closing is an explicit dismissal, and silently restoring an old edit
  // later — possibly much later, over a todo since changed elsewhere — is
  // worse than losing it. Switching to another todo and back is the same
  // case, and lands here the same way.
  useEffect(() => {
    if (!todo) {
      shownUid.current = null
      // Closing re-locks, so reopening a completed todo asks again.
      setUnlocked(false)
      return
    }
    if (todo.uid === shownUid.current) return
    shownUid.current = todo.uid
    initialFields.current = dueToFields(todo.due)
    // `reset` also clears `isDirty`, so the newly opened todo starts clean.
    reset(defaultsFor(todo, initialFields.current))
    // Switching to a different todo re-locks for the same reason.
    setUnlocked(false)
  }, [todo, reset])

  const submit = (values: DetailForm): void => {
    if (!todo) return
    const changes = detailChanges(values, todo, initialFields.current)
    // Save first, then move. The outbox folds a pending update into the
    // move's payload (sync/coalesce.ts), so ordering this way means the
    // copy written to the target list carries this edit — the reverse
    // would queue an update against a resource the move has already
    // deleted (docs/specs/todos.md — moving a todo between lists).
    handlers.onSave(changes)
    if (values.listId !== todo.listId) handlers.onMove(values.listId)
    handlers.onClose()
  }

  return {
    control,
    isDirty,
    onSubmit: handleSubmit(submit),
    /**
     * Throw away the edit in progress and go back to what is stored.
     *
     * The footer's second "Close" became this: closing is the header's ✕
     * (docs/specs/ui.md — overlays: one close control), which left the
     * footer button duplicating it. Reverting is the thing that had no
     * control at all — before, undoing an edit meant closing the panel and
     * reopening it. *(changed 2026-08-04.)*
     *
     * Re-seeds from the same values `defaultsFor` produced on open, so
     * `isDirty` returns to false and the DUE fields go back to the form
     * the todo actually carries rather than a re-derived guess.
     */
    revert: (): void => {
      if (!todo) return
      initialFields.current = dueToFields(todo.due)
      reset(defaultsFor(todo, initialFields.current))
    },
    // Only a *completed* todo locks. An active one has nothing to protect:
    // editing it is the ordinary case, not a rewrite of a finished record.
    locked: todo?.completed === true && !unlocked,
    unlock: (): void => setUnlocked(true),
  }
}
