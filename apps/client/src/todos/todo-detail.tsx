import { Dialog } from '@base-ui/react/dialog'
import { Field } from '@base-ui/react/field'
import { Form } from '@base-ui/react/form'
import { Input } from '@base-ui/react/input'
import { Select } from '@base-ui/react/select'
import {
  todoPrioritySchema,
  type Todo,
  type TodoChanges,
  type TodoList,
} from '@fold/schemas'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { LuChevronDown } from 'react-icons/lu'
import { z } from 'zod'
import { cx } from '../styles/cx'
import { dueToFields, fieldsToDue } from './due-fields'
import styles from './todo-detail.module.css'

// docs/specs/todos.md — due times: a time needs a date, since DUE cannot
// express one without the other.
const detailSchema = z
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
type DetailForm = z.infer<typeof detailSchema>

const PRIORITY_OPTIONS: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'None', value: '' },
  { label: 'High', value: 'high' },
  { label: 'Medium', value: 'medium' },
  { label: 'Low', value: 'low' },
]

// Detail edit — docs/specs/todos.md. Rendered as a bottom sheet on mobile
// and a side panel on desktop (docs/specs/ui.md — layout), using Base UI's
// Dialog for focus management: focus moves into the surface on open and
// restores to the trigger on close.
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
  onSave: (changes: TodoChanges) => void
  /** Move the todo to another list. Called before `onSave`. */
  onMove: (targetListId: string) => void
  onDelete: () => void
  onClose: () => void
}) {
  const { todo } = props
  const initialFields = dueToFields(todo.due)
  const listOptions = props.lists.map((list) => ({
    label: list.displayName,
    value: list.id,
  }))

  const { control, handleSubmit } = useForm<DetailForm>({
    resolver: zodResolver(detailSchema),
    defaultValues: {
      summary: todo.summary,
      due: initialFields.date,
      dueTime: initialFields.time,
      description: todo.description ?? '',
      priority: todo.priority ?? '',
      listId: todo.listId,
    },
  })

  const submit = (values: DetailForm): void => {
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
      fieldsToDue({ date: values.due, time: values.dueTime }) ?? undefined
    const changes: TodoChanges = {
      ...(values.summary !== todo.summary ? { summary: values.summary } : {}),
      ...(untouched ? {} : { due: nextDue ?? null }),
      description: values.description === '' ? null : values.description,
      priority: values.priority === '' ? null : values.priority,
    }
    // Save first, then move. The outbox folds a pending update into the
    // move's payload (sync/coalesce.ts), so ordering this way means the
    // copy written to the target list carries this edit — the reverse
    // would queue an update against a resource the move has already
    // deleted (docs/specs/todos.md — moving a todo between lists).
    props.onSave(changes)
    if (values.listId !== todo.listId) props.onMove(values.listId)
    props.onClose()
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={cx(styles['backdrop'])} />
        <Dialog.Popup className={cx(styles['popup'])}>
          <Dialog.Title className={cx(styles['title'])}>Edit todo</Dialog.Title>
          <Form className={styles['form']} onSubmit={handleSubmit(submit)}>
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
                    <Select.Trigger className={styles['selectTrigger']}>
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
                                <Select.ItemText>
                                  {option.label}
                                </Select.ItemText>
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
              <button type="submit" className={styles['save']}>
                Save
              </button>
              <button
                type="button"
                className={styles['close']}
                onClick={props.onClose}
              >
                Close
              </button>
              <button
                type="button"
                className={styles['delete']}
                onClick={props.onDelete}
              >
                Delete
              </button>
            </div>
          </Form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
