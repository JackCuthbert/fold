import { Dialog } from '@base-ui/react/dialog'
import { Field } from '@base-ui/react/field'
import { Form } from '@base-ui/react/form'
import { Input } from '@base-ui/react/input'
import { Select } from '@base-ui/react/select'
import type { Todo, TodoList } from '@fold/schemas'
import { useEffect, useRef, type ReactNode } from 'react'
import { Controller } from 'react-hook-form'
import { LuChevronDown } from 'react-icons/lu'
import { ModalHeader } from '../modal-header'
import { cx } from '../styles/cx'
import { cycleTimeOf, punctualityOf, type Punctuality } from './punctuality'
import { formatTimestamp } from './summary'
import styles from './todo-detail.module.css'
import type { TodoDetailForm } from './use-todo-detail-form'

// docs/specs/ui.md — status display: reuse the semantic status tokens
// (green succeeded, amber caution, red missed) rather than inventing a
// palette. The label carries the meaning; colour only reinforces it.
const PUNCTUALITY_CLASS: Record<Punctuality, string> = {
  early: styles['metaEarly'] ?? '',
  onTime: styles['metaOnTime'] ?? '',
  late: styles['metaLate'] ?? '',
}

const PRIORITY_OPTIONS: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'None', value: '' },
  { label: 'High', value: 'high' },
  { label: 'Medium', value: 'medium' },
  { label: 'Low', value: 'low' },
]

// docs/specs/todos.md — priority is colour-coded: the option that sets a
// priority uses the same ink as the row that displays it. Keyed by option
// value, so 'None' ('') simply finds nothing and stays plain ink — it is
// the absence of a priority, not a fourth level. The label text is always
// rendered alongside, so meaning never depends on colour alone.
const PRIO_CLASS: Record<string, string | undefined> = {
  high: styles['prioHigh'],
  medium: styles['prioMedium'],
  low: styles['prioLow'],
}

// Detail edit — docs/specs/todos.md. Rendered as a bottom sheet on mobile
// and, since issue #4, a layout column on desktop (docs/specs/ui.md —
// layout / the detail panel).
//
// *(changed 2026-08-03, issue #4: on desktop this was a Dialog with a
// scrim at every viewport. It is now a third flex child of `.body`,
// alongside the nav and `<main>` — no scrim, no dimming, and the list
// behind it stays live, so another todo can be opened without closing this
// one first. Mobile is untouched and keeps the modal sheet.)*
//
// One component with a `mode` prop rather than two wrappers: the form body
// below is ~300 lines and identical in both, so two wrappers would either
// duplicate it or need a shared inner component anyway — which is this,
// with extra steps. Only the surface around the form differs.
//
// Presentational: the form itself belongs to the caller
// (use-todo-detail-form.ts), which is what lets an unsaved edit survive the
// breakpoint — see that file. Everything here reads from `props.form`.
// *(changed 2026-08-03: `useForm` and `submit` lived here, so crossing the
// breakpoint discarded the edit along with the component.)*
//
// Every field uses Base UI's Field/Input/Select, wired to react-hook-form
// via Controller (docs/specs/ui.md — component library): Base UI supplies
// the accessible primitive, react-hook-form + zod remain the state/
// validation layer.
// The date and time inputs show whatever form the DUE has, read from the
// stored form rather than a resolved instant (docs/specs/todos.md — due
// times): an all-day todo must show an empty time, not the 23:59 its
// ordering instant resolves to. If the user doesn't touch either input we
// send NO due change at all, so a foreign client's floating/zoned/UTC value
// survives untouched (docs/specs/caldav-compliance.md). Only an actual edit
// rewrites it — as an all-day 'date', or as 'zoned' once a time is given.
export function TodoDetail(props: {
  todo: Todo
  /** Every list, for the move dropdown (docs/specs/todos.md). */
  lists: readonly TodoList[]
  /** The hoisted form — see use-todo-detail-form.ts. */
  form: TodoDetailForm
  /**
   * Which surface to render. `'sheet'` is the mobile modal bottom sheet
   * (Base UI Dialog, scrim, focus trap); `'column'` is the desktop layout
   * column, which is not modal at all. Chosen by the caller from the same
   * `isDesktop` media query the nav splits on (main-screen.tsx).
   */
  mode: 'sheet' | 'column'
  /**
   * Changes on every open, so the column can move focus into itself even
   * when the same todo is re-opened — clicking the row that is already
   * showing changes neither the todo nor the element's `key`, so there is
   * no remount to hang the focus effect on. Column mode only; the sheet
   * gets focus management from Base UI's Dialog.
   */
  focusNonce?: number
  onDelete: () => void
  onClose: () => void
}) {
  const { todo } = props
  const { control, isDirty, onSubmit } = props.form
  // Captured once so every row in the metadata footer resolves "Today"
  // against the same instant.
  const now = new Date()
  const punctuality = punctualityOf(todo)
  const cycleTime = cycleTimeOf(todo)
  const listOptions = props.lists.map((list) => ({
    label: list.displayName,
    value: list.id,
  }))

  const body = (
    <>
      {/* The column has no Dialog context, so `Dialog.Title`/`Dialog.Close`
          would throw — it supplies a plain heading and a real button
          instead (modal-header.tsx — `render`). The ✕ still closes the
          column: it is no longer a modal, but a ✕ to dismiss the panel is
          still the right control. The heading is focusable (tabIndex -1)
          because DetailColumn moves focus to it on open. */}
      <ModalHeader
        size="large"
        {...(props.mode === 'column'
          ? {
              render: {
                title: <h2 tabIndex={-1} />,
                close: <button type="button" onClick={props.onClose} />,
              },
            }
          : {})}
      >
        Edit todo
      </ModalHeader>
      <Form className={styles['form']} onSubmit={onSubmit}>
        <Controller
          name="summary"
          control={control}
          render={({
            field: { ref, name, value, onBlur, onChange },
            fieldState: { invalid, error },
          }) => (
            <Field.Root
              className={styles['field']}
              name={name}
              invalid={invalid}
            >
              <Field.Label>Summary</Field.Label>
              <Input
                ref={ref}
                value={value}
                onBlur={onBlur}
                onValueChange={onChange}
              />
              {error && (
                <Field.Error className={styles['error']} match>
                  {error.message}
                </Field.Error>
              )}
            </Field.Root>
          )}
        />
        {/* docs/specs/todos.md — due times: the time sits beside the
                date as one "Due" control, and is optional — an empty time
                means the todo is all-day. */}
        <div className={styles['dueRow']}>
          <Controller
            name="due"
            control={control}
            render={({ field: { ref, name, value, onBlur, onChange } }) => (
              <Field.Root
                className={cx(styles['field'], styles['dueDate'])}
                name={name}
              >
                <Field.Label>Due</Field.Label>
                <Input
                  ref={ref}
                  type="date"
                  value={value}
                  onBlur={onBlur}
                  onValueChange={onChange}
                />
              </Field.Root>
            )}
          />
          <Controller
            name="dueTime"
            control={control}
            render={({
              field: { ref, name, value, onBlur, onChange },
              fieldState: { error },
            }) => (
              <Field.Root
                className={cx(styles['field'], styles['dueTime'])}
                name={name}
              >
                <Field.Label>Time</Field.Label>
                <Input
                  ref={ref}
                  type="time"
                  value={value}
                  onBlur={onBlur}
                  onValueChange={onChange}
                />
                {error?.message && (
                  <Field.Error className={styles['error']} match>
                    {error.message}
                  </Field.Error>
                )}
              </Field.Root>
            )}
          />
        </div>
        <Controller
          name="priority"
          control={control}
          render={({ field: { name, value, onChange } }) => (
            <Field.Root className={styles['field']} name={name}>
              <Field.Label>Priority</Field.Label>
              <Select.Root
                items={PRIORITY_OPTIONS}
                value={value}
                onValueChange={onChange}
              >
                <Select.Trigger
                  className={cx(styles['selectTrigger'], PRIO_CLASS[value])}
                >
                  <Select.Value />
                  <Select.Icon className={styles['selectIcon']}>
                    <LuChevronDown aria-hidden="true" size={14} />
                  </Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  {/* alignItemWithTrigger={false} turns off Base UI's
                          default overlap (which aligns the selected item
                          over the trigger text) so the list opens below
                          the input instead of covering it. Width matching
                          is CSS — see .selectPopup's --anchor-width. */}
                  <Select.Positioner
                    className={styles['selectPositioner']}
                    side="bottom"
                    sideOffset={4}
                    alignItemWithTrigger={false}
                  >
                    <Select.Popup className={styles['selectPopup']}>
                      {PRIORITY_OPTIONS.map((option) => (
                        <Select.Item
                          key={option.value}
                          value={option.value}
                          className={cx(
                            styles['selectItem'],
                            PRIO_CLASS[option.value],
                          )}
                        >
                          <Select.ItemText>{option.label}</Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.Popup>
                  </Select.Positioner>
                </Select.Portal>
              </Select.Root>
            </Field.Root>
          )}
        />
        {/* docs/specs/todos.md — moving a todo between lists: a List
                dropdown alongside Priority, applied on Save with every
                other edit. Only rendered when there's somewhere to move
                to; with a single list the control would be inert. */}
        {props.lists.length > 1 && (
          <Controller
            name="listId"
            control={control}
            render={({ field: { name, value, onChange } }) => (
              <Field.Root className={styles['field']} name={name}>
                <Field.Label>List</Field.Label>
                <Select.Root
                  items={listOptions}
                  value={value}
                  onValueChange={onChange}
                >
                  <Select.Trigger className={styles['selectTrigger']}>
                    <Select.Value />
                    <Select.Icon className={styles['selectIcon']}>
                      <LuChevronDown aria-hidden="true" size={14} />
                    </Select.Icon>
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Positioner
                      className={styles['selectPositioner']}
                      side="bottom"
                      sideOffset={4}
                      alignItemWithTrigger={false}
                    >
                      <Select.Popup className={styles['selectPopup']}>
                        {listOptions.map((option) => (
                          <Select.Item
                            key={option.value}
                            value={option.value}
                            className={styles['selectItem']}
                          >
                            <Select.ItemText>{option.label}</Select.ItemText>
                          </Select.Item>
                        ))}
                      </Select.Popup>
                    </Select.Positioner>
                  </Select.Portal>
                </Select.Root>
              </Field.Root>
            )}
          />
        )}
        <Controller
          name="description"
          control={control}
          render={({ field: { ref, name, value, onBlur, onChange } }) => (
            <Field.Root className={styles['field']} name={name}>
              <Field.Label>Notes</Field.Label>
              <Field.Control
                ref={ref}
                render={<textarea rows={4} />}
                value={value}
                onBlur={onBlur}
                onValueChange={onChange}
              />
            </Field.Root>
          )}
        />
        <div className={styles['actions']}>
          {/* Nothing to save until something changes. `isDirty` compares
                  against the todo's *stored* values, seeded when this todo
                  was opened (use-todo-detail-form.ts), so opening a todo and
                  closing it costs no PUT — and no SEQUENCE bump on the
                  server. *(added 2026-08-03.)* */}
          <button type="submit" className={styles['save']} disabled={!isDirty}>
            Save
          </button>
          <button
            type="button"
            className={styles['close']}
            onClick={props.onClose}
          >
            Close
          </button>
          {/* Save is disabled until something changes, which leaves the
              panel looking inert while you are in fact mid-edit. This says
              why the button is live — and, more usefully, warns that
              closing now would lose the change. `role="status"` so it is
              announced rather than only seen. Sits between the buttons and
              Delete, in space the row already had. *(added 2026-08-03.)* */}
          {isDirty && (
            <span className={styles['dirty']} role="status">
              Unsaved changes
            </span>
          )}
          <button
            type="button"
            className={styles['delete']}
            onClick={props.onDelete}
          >
            Delete
          </button>
        </div>

        {/* docs/specs/todos.md — metadata: facts *about* the todo rather
                than fields on it, so it reads as a footnote below the
                actions. Inside the form (which is the panel's scroller)
                rather than after it: as a sibling it would be pinned to the
                panel's bottom edge, stranded far below the buttons whenever
                the panel is taller than its content. Only rendered when
                there is something to show — an open todo has no completion
                date, and a completed one written by another client may not
                carry one either (docs/specs/summary-view.md). */}
        {(todo.created || todo.completedAt) && (
          <dl className={styles['meta']}>
            {todo.created && (
              <div className={styles['metaRow']}>
                <dt className={styles['metaLabel']}>Created</dt>
                <dd className={styles['metaValue']}>
                  {formatTimestamp(todo.created, now)}
                </dd>
              </div>
            )}
            {todo.completedAt && (
              <div className={styles['metaRow']}>
                <dt className={styles['metaLabel']}>Completed</dt>
                <dd className={styles['metaValue']}>
                  {formatTimestamp(todo.completedAt, now)}
                </dd>
              </div>
            )}
            {/* CREATED to COMPLETED. Uncoloured: unlike punctuality
                    there is no good or bad duration, so this is context
                    rather than a verdict. */}
            {cycleTime && (
              <div className={styles['metaRow']}>
                <dt className={styles['metaLabel']}>Duration</dt>
                <dd className={styles['metaValue']}>{cycleTime}</dd>
              </div>
            )}
            {/* Derived from COMPLETED against DUE, so it appears only
                    when both exist. Colour-coded with the same semantic
                    status tokens as sync status and priority rather than a
                    third palette, and the verdict is spelled out in words
                    so meaning never depends on colour alone
                    (docs/specs/ui.md — status display). */}
            {punctuality && (
              <div className={styles['metaRow']}>
                <dt className={styles['metaLabel']}>Timing</dt>
                <dd
                  className={cx(
                    styles['metaValue'],
                    PUNCTUALITY_CLASS[punctuality.kind],
                  )}
                >
                  {punctuality.label}
                </dd>
              </div>
            )}
          </dl>
        )}
      </Form>
    </>
  )

  // Mobile keeps the modal bottom sheet exactly as it was: Base UI's Dialog
  // supplies the scrim, the focus trap, the scroll lock, Escape and focus
  // restoration (docs/specs/ui.md — overlays: every overlay dims the
  // background).
  if (props.mode === 'sheet') {
    return (
      <Dialog.Root
        open
        onOpenChange={(open) => {
          if (!open) props.onClose()
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className={cx(styles['backdrop'])} />
          <Dialog.Popup className={cx(styles['popup'])}>{body}</Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    )
  }

  return (
    <DetailColumn focusNonce={props.focusNonce ?? 0} onClose={props.onClose}>
      {body}
    </DetailColumn>
  )
}

/**
 * The desktop surface: a plain region, deliberately **not** a dialog.
 *
 * docs/specs/ui.md — the detail panel: on desktop it is part of the layout
 * like the nav, so it has no scrim and does not trap focus — the point of
 * dropping modality is that the list behind it stays usable, and Tab must
 * be able to leave. *(added 2026-08-03, issue #4.)*
 *
 * What Base UI's Dialog was giving us and what replaces it:
 *
 * - **Focus trap** — deliberately gone. Nothing replaces it.
 * - **Scrim / scroll lock** — gone; the column dims nothing.
 * - **Escape to close** — a plain `keydown` handler here. Bound to the
 *   panel rather than the document so it only fires while focus is inside:
 *   Escape with focus out in the list belongs to whatever has focus there,
 *   not to this panel.
 * - **Focus in on open, back to the trigger on close** — kept, because
 *   without it a keyboard user loses their place entirely. Handled by the
 *   caller for the return half (main-screen.tsx holds the row's ref, the
 *   same explicit-trigger approach add-todo-modal.tsx uses via
 *   `finalFocus` — the heuristic Base UI falls back to is untrustworthy
 *   once a re-render moves the rows).
 */
function DetailColumn(props: {
  children: ReactNode
  focusNonce: number
  onClose: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)

  // Move focus into the panel when it opens. The heading is the target
  // rather than the first input: landing in the Summary field would mean a
  // stray keystroke edits the todo, and it puts a screen reader in the
  // middle of the form with no announcement of what surface it just
  // entered. `tabIndex={-1}` on the heading makes it focusable without
  // adding it to the tab order.
  //
  // Keyed on the nonce, not on mount, so re-clicking the already-open row
  // pulls focus back in too — that click remounts nothing.
  useEffect(() => {
    panel.current?.querySelector('h2')?.focus()
  }, [props.focusNonce])

  return (
    <div
      ref={panel}
      className={styles['column']}
      // Named by its own heading, so assistive tech announces the region
      // rather than an unlabelled group. Not role="dialog": it is not
      // modal, and claiming otherwise would tell a screen reader the rest
      // of the page is inert when it is very much not.
      role="region"
      aria-label="Edit todo"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        // A Select inside the panel handles its own Escape to close its
        // popup; without this check the same keypress would also close the
        // whole panel out from under it.
        if (event.defaultPrevented) return
        props.onClose()
      }}
    >
      {props.children}
    </div>
  )
}
