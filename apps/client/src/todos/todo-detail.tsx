import { Dialog } from '@base-ui/react/dialog'
import { Field } from '@base-ui/react/field'
import { Form } from '@base-ui/react/form'
import { Input } from '@base-ui/react/input'
import { Select } from '@base-ui/react/select'
import {
  todoPrioritySchema,
  type Todo,
  type TodoChanges,
} from '@caldav-todo/schemas'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { LuChevronDown } from 'react-icons/lu'
import { z } from 'zod'
import { cx } from '../styles/cx'
import { dueInstant } from './sort'
import styles from './todo-detail.module.css'

const detailSchema = z.object({
  summary: z.string().min(1),
  due: z.string(), // '' or yyyy-mm-dd from <input type="date">
  description: z.string(),
  priority: z.union([todoPrioritySchema, z.literal('')]),
})
type DetailForm = z.infer<typeof detailSchema>

const PRIORITY_OPTIONS: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'None', value: '' },
  { label: 'High', value: 'high' },
  { label: 'Medium', value: 'medium' },
  { label: 'Low', value: 'low' },
]

/** Local yyyy-mm-dd for <input type="date"> (not UTC — toISOString shifts). */
const toDateInputValue = (date: Date): string =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')

// Detail edit — docs/specs/todos.md. Rendered as a bottom sheet on mobile
// and a side panel on desktop (docs/specs/ui.md — layout), using Base UI's
// Dialog for focus management: focus moves into the surface on open and
// restores to the trigger on close.
// Every field uses Base UI's Field/Input/Select, wired to react-hook-form
// via Controller (docs/specs/ui.md — component library): Base UI supplies
// the accessible primitive, react-hook-form + zod remain the state/
// validation layer.
// The date input shows the local date of whatever form the DUE has. If the
// user doesn't touch it, we send NO due change at all, so a foreign client's
// floating/zoned/UTC value survives untouched
// (docs/specs/caldav-compliance.md). Only an actual edit rewrites it, and
// then as an all-day 'date' — which is what the date input expresses.
export function TodoDetail(props: {
  todo: Todo
  onSave: (changes: TodoChanges) => void
  onDelete: () => void
  onClose: () => void
}) {
  const { todo } = props
  // Local date of the existing due, in the input's yyyy-mm-dd format.
  const initialDue = todo.due
    ? toDateInputValue(new Date(dueInstant(todo)))
    : ''

  const { control, handleSubmit } = useForm<DetailForm>({
    resolver: zodResolver(detailSchema),
    defaultValues: {
      summary: todo.summary,
      due: initialDue,
      description: todo.description ?? '',
      priority: todo.priority ?? '',
    },
  })

  const submit = (values: DetailForm): void => {
    const changes: TodoChanges = {
      ...(values.summary !== todo.summary ? { summary: values.summary } : {}),
      // Untouched date input → omit `due` entirely → preserve as stored.
      ...(values.due === initialDue
        ? {}
        : {
            due:
              values.due === ''
                ? null
                : { kind: 'date' as const, value: values.due },
          }),
      description: values.description === '' ? null : values.description,
      priority: values.priority === '' ? null : values.priority,
    }
    props.onSave(changes)
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
            <Controller
              name="due"
              control={control}
              render={({ field: { ref, name, value, onBlur, onChange } }) => (
                <Field.Root className={styles['field']} name={name}>
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
                      <Select.Positioner
                        className={styles['selectPositioner']}
                        sideOffset={4}
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
