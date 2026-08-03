import { Accordion } from '@base-ui/react/accordion'
import { Dialog } from '@base-ui/react/dialog'
import { Field } from '@base-ui/react/field'
import { Form } from '@base-ui/react/form'
import { Input } from '@base-ui/react/input'
import { Select } from '@base-ui/react/select'
import { todoPrioritySchema, type NewTodo } from '@fold/schemas'
import { zodResolver } from '@hookform/resolvers/zod'
import type { RefObject } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { LuChevronDown, LuChevronRight } from 'react-icons/lu'
import { z } from 'zod'
import { ModalHeader } from '../modal-header'
import { cx } from '../styles/cx'
import styles from './add-todo-modal.module.css'
import { fieldsToDue } from './due-fields'

// docs/specs/todos.md — due times: a time needs a date, since DUE cannot
// express one without the other. Caught here so the user sees an error
// rather than having the time silently dropped.
const addTodoSchema = z
  .object({
    summary: z.string().min(1),
    due: z.string(),
    dueTime: z.string(),
    description: z.string(),
    priority: z.union([todoPrioritySchema, z.literal('')]),
  })
  .refine((values) => values.dueTime === '' || values.due !== '', {
    path: ['dueTime'],
    message: 'Pick a date for this time',
  })
type AddTodoForm = z.infer<typeof addTodoSchema>

const PRIORITY_OPTIONS: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'None', value: '' },
  { label: 'High', value: 'high' },
  { label: 'Medium', value: 'medium' },
  { label: 'Low', value: 'low' },
]

const EMPTY_VALUES: AddTodoForm = {
  summary: '',
  due: '',
  dueTime: '',
  description: '',
  priority: '',
}

// docs/specs/ui.md — layout: adding a todo opens a modal rather than an
// inline field, so it gets room for detail without crowding the list. The
// title field is the fast path (type, Enter, done); due date, priority and
// notes live in a collapsed-by-default Advanced accordion — everything the
// detail view can edit, so a todo can be fully specified at creation.
// Every field is Base UI (Dialog, Accordion, Field, Input, Select), wired
// to react-hook-form + zod via Controller (docs/specs/ui.md — component
// library / forms).
export function AddTodoModal(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (todo: NewTodo) => void
  // docs/specs/ui.md — accessibility: focus must not land somewhere
  // misleading after an action. This dialog is opened from a plain
  // <button> (todo-pane.tsx), not a Base UI `Dialog.Trigger`, so Base UI
  // has no registered reference element to restore focus to on close and
  // falls back to an untrustworthy heuristic — which, once submitting
  // re-renders the todo list, can resolve to the first row instead of the
  // button that opened the modal. Passing the trigger explicitly via
  // `finalFocus` removes the guesswork.
  triggerRef: RefObject<HTMLButtonElement | null>
}) {
  const { control, handleSubmit, reset } = useForm<AddTodoForm>({
    resolver: zodResolver(addTodoSchema),
    defaultValues: EMPTY_VALUES,
  })

  const submit = (values: AddTodoForm): void => {
    // All-day when no time is given, zoned when there is
    // (docs/specs/todos.md — due times). `undefined` means the schema's
    // time-needs-a-date rule already rejected this, so it can't reach here.
    const due = fieldsToDue({ date: values.due, time: values.dueTime })
    props.onAdd({
      uid: crypto.randomUUID(),
      summary: values.summary,
      ...(due ? { due } : {}),
      ...(values.description ? { description: values.description } : {}),
      ...(values.priority ? { priority: values.priority } : {}),
    })
    reset(EMPTY_VALUES)
    props.onOpenChange(false)
  }

  return (
    <Dialog.Root
      open={props.open}
      onOpenChange={(open) => {
        if (!open) reset(EMPTY_VALUES)
        props.onOpenChange(open)
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={cx(styles['backdrop'])} />
        <Dialog.Popup
          className={cx(styles['popup'])}
          finalFocus={props.triggerRef}
        >
          <ModalHeader>Add a todo</ModalHeader>
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
                  <Input
                    ref={ref}
                    autoFocus
                    placeholder="Add a todo…"
                    aria-label="Add a todo"
                    enterKeyHint="done"
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

            <Accordion.Root className={styles['accordion']}>
              <Accordion.Item className={styles['accordionItem']}>
                <Accordion.Trigger className={styles['accordionTrigger']}>
                  <LuChevronRight
                    className={styles['chevron']}
                    aria-hidden="true"
                    size={14}
                  />
                  Advanced
                </Accordion.Trigger>
                <Accordion.Panel className={styles['accordionPanel']}>
                  {/* docs/specs/todos.md — due times: the time sits beside
                      the date as one "Due" control, and is optional —
                      leaving it empty keeps the todo all-day. */}
                  <div className={styles['dueRow']}>
                    <Controller
                      name="due"
                      control={control}
                      render={({
                        field: { ref, name, value, onBlur, onChange },
                      }) => (
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
                            {/* Opens below the input rather than covering
                                it — see todo-detail.tsx for the reasoning. */}
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
                  <Controller
                    name="description"
                    control={control}
                    render={({
                      field: { ref, name, value, onBlur, onChange },
                    }) => (
                      <Field.Root className={styles['field']} name={name}>
                        <Field.Label>Notes</Field.Label>
                        <Field.Control
                          ref={ref}
                          render={<textarea rows={3} />}
                          value={value}
                          onBlur={onBlur}
                          onValueChange={onChange}
                        />
                      </Field.Root>
                    )}
                  />
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion.Root>

            <div className={styles['actions']}>
              <button type="submit" className={styles['add']}>
                Add
              </button>
              <button
                type="button"
                className={styles['cancel']}
                onClick={() => props.onOpenChange(false)}
              >
                Cancel
              </button>
            </div>
          </Form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
