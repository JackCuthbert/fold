import { Accordion } from '@base-ui/react/accordion'
import { Dialog } from '@base-ui/react/dialog'
import { Field } from '@base-ui/react/field'
import { Form } from '@base-ui/react/form'
import { Input } from '@base-ui/react/input'
import { Select } from '@base-ui/react/select'
import { todoPrioritySchema, type NewTodo } from '@fold/schemas'
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, type RefObject } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { LuChevronDown, LuChevronRight } from 'react-icons/lu'
import { z } from 'zod'
import { featuresOf } from '../../lists/lib/list-kind'
import { ModalHeader } from '../../ui'
import { cx } from '../../styles/cx'
import { PRIORITY_CHOICES, priorityChoice } from '../lib/priority-choices'
import styles from './add-todo-modal.module.css'
import { DueControls } from '../due-controls/due-controls'
import { fieldsToDue } from '../lib/due-fields'

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
    // '' when the modal was opened from inside a list, which supplies the
    // target itself. Only the global path (issue #15) renders the picker,
    // and `pickList` below makes it required there.
    listId: z.string(),
  })
  .refine((values) => values.dueTime === '' || values.due !== '', {
    path: ['dueTime'],
    message: 'Pick a date for this time',
  })

/**
 * The schema for the global add-todo path, where the list is the user's to
 * choose and there is no sensible default (issue #15).
 *
 * A second schema rather than a flag inside the first: "required only
 * sometimes" is the kind of conditional validation that reads fine and
 * fails quietly. Here the requirement is a property of *which form is
 * open*, so it belongs to the form rather than to the field.
 */
const globalAddTodoSchema = addTodoSchema.refine(
  (values) => values.listId !== '',
  { path: ['listId'], message: 'Choose a list' },
)
type AddTodoForm = z.infer<typeof addTodoSchema>

/**
 * The dropdown's options — the same shared list, in the same order, that
 * the detail panel and the row's context menu use
 * (todos/lib/priority-choices), so the three cannot drift. The empty
 * string is this Select's "none", which is what the form field stores.
 * *(sourced from the shared list 2026-08-11: this file and todo-detail.tsx
 * each held their own copy.)*
 */
const PRIORITY_OPTIONS = PRIORITY_CHOICES.map((choice) => ({
  label: choice.label,
  value: choice.value ?? '',
  icon: choice.icon,
}))

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

/**
 * A list's colour dot, for the picker's trigger and its options
 * (docs/specs/lists.md — colours).
 *
 * Local to this file rather than promoted to a shared component: the four
 * other surfaces that draw this dot each compose the same two classes from
 * `lists/list-dot.module.css` and pass their own colour, which is the
 * sharing that matters — the geometry lives in one stylesheet. A component
 * wrapping three lines of JSX would add an indirection without removing a
 * duplicate. *(added 2026-08-14, issue #59.)*
 */
interface ListDotProps {
  /** Absent for an uncoloured list, which gets the empty ring instead. */
  color?: string | undefined
}

function ListDot(props: ListDotProps) {
  return (
    <span
      className={cx(
        styles['listDot'],
        props.color === undefined && styles['listDotEmpty'],
      )}
      // `background` directly, not `colourVar`. The shared `.dot` paints
      // its own box and sets no background of its own, so each caller
      // supplies one — the move modal does the same. `--marker` is read
      // only by the filter popover's `::after` variant, and setting it
      // here left every coloured dot invisible while the uncoloured ring,
      // which needs no fill, looked correct.
      // *(fixed 2026-08-14, caught in the browser.)*
      {...(props.color === undefined
        ? {}
        : { style: { background: props.color } })}
      aria-hidden="true"
    />
  )
}

const EMPTY_VALUES: AddTodoForm = {
  summary: '',
  due: '',
  dueTime: '',
  description: '',
  priority: '',
  listId: '',
}

// docs/specs/ui.md — layout: adding a todo opens a modal rather than an
// inline field, so it gets room for detail without crowding the list. The
// title field is the fast path (type, Enter, done); due date, priority and
// notes live in a collapsed-by-default Advanced accordion — everything the
// detail view can edit, so a todo can be fully specified at creation.
// Every field is Base UI (Dialog, Accordion, Field, Input, Select), wired
// to react-hook-form + zod via Controller (docs/specs/ui.md — component
// library / forms).
/**
 * Where a new todo goes, and so which shape the form takes.
 *
 * A union rather than optional props, because the two modes are mutually
 * exclusive: the in-list path already knows the list and must not render a
 * picker; the global path cannot know it and must. Optional callbacks
 * would let a caller supply neither, or both, and only find out at
 * runtime.
 */
type AddTodoTarget =
  /** Opened from inside a list, which is the target (todo-pane.tsx). */
  | {
      kind: 'list'
      /** Its name, which decides the list's kind — docs/specs/list-kinds.md. */
      listName: string
      onAdd: (todo: NewTodo) => void
    }
  /**
   * Opened from anywhere — the sidebar button or Cmd/Ctrl+K (issue #15).
   * Renders a picker, pre-filled with the list on screen when there is
   * one and demanding a choice when there isn't — see `defaultListId`.
   * *(changed 2026-08-05: was never pre-filled.)*
   */
  | {
      kind: 'global'
      /**
       * `color` so the picker can draw each list's dot — the same marker
       * the nav, the pane title, the filter popover and the move modal all
       * use (docs/specs/lists.md — colours). Optional per list: an
       * uncoloured one gets the shared empty ring rather than nothing, so
       * every option keeps one left edge.
       * *(added 2026-08-14, issue #59: this was the one surface naming a
       * list without its dot.)*
       */
      lists: ReadonlyArray<{
        id: string
        displayName: string
        // `| undefined` explicitly: `exactOptionalPropertyTypes` is on, and
        // `TodoList` declares it the same way, so an uncoloured list can
        // carry the key at all.
        color?: string | undefined
      }>
      /**
       * Pre-selected list — the one on screen, when there is one.
       *
       * Absent on Today and Summary, which are not lists, and there the
       * picker still demands a choice: filing a todo into a list you were
       * never looking at is worse than asking which.
       * *(added 2026-08-05.)*
       */
      defaultListId?: string
      onAdd: (listId: string, todo: NewTodo) => void
    }

interface AddTodoModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: AddTodoTarget
  // docs/specs/ui.md — accessibility: focus must not land somewhere
  // misleading after an action. This dialog is opened from a plain
  // <button> (todo-pane.tsx), not a Base UI `Dialog.Trigger`, so Base UI
  // has no registered reference element to restore focus to on close and
  // falls back to an untrustworthy heuristic — which, once submitting
  // re-renders the todo list, can resolve to the first row instead of the
  // button that opened the modal. Passing the trigger explicitly via
  // `finalFocus` removes the guesswork.
  triggerRef: RefObject<HTMLButtonElement | null>
}

export function AddTodoModal(props: AddTodoModalProps) {
  const pickList = props.target.kind === 'global'
  const listOptions =
    props.target.kind === 'global'
      ? props.target.lists.map((list) => ({
          label: list.displayName,
          value: list.id,
          // Kept on the option rather than looked up again at render:
          // `Select.Value` renders from the items array, so the trigger
          // has nothing else to read the colour from.
          color: list.color,
        }))
      : []
  const { control, handleSubmit, reset, watch } = useForm<AddTodoForm>({
    resolver: zodResolver(pickList ? globalAddTodoSchema : addTodoSchema),
    defaultValues: EMPTY_VALUES,
  })

  // `defaultValues` is read once, at mount — and this modal is rendered
  // by MainScreen for the life of the session, so it never remounts.
  // Without this the picker kept whichever list was selected the first
  // time the app rendered, including on Today, where the whole point is
  // that there is no default. Re-seeded on each open instead.
  // *(added 2026-08-05.)*
  const defaultListId =
    props.target.kind === 'global' ? props.target.defaultListId : undefined
  useEffect(() => {
    if (props.open) reset({ ...EMPTY_VALUES, listId: defaultListId ?? '' })
    // Deliberately keyed on open + the default only. `reset` is stable
    // across renders, and re-seeding on anything else would wipe what the
    // user has typed mid-form.
  }, [props.open, defaultListId, reset])

  // docs/specs/list-kinds.md — a media list's todos have no due date, so
  // the fields are not rendered at all. Watched rather than read once:
  // the global form has a list picker, so the answer changes as you
  // choose, and the fields have to appear or vanish with it.
  // *(added 2026-08-05, issue #27.)*
  const chosenListId = watch('listId')
  const targetListName =
    props.target.kind === 'list'
      ? props.target.listName
      : (props.target.lists.find((list) => list.id === chosenListId)
          ?.displayName ?? '')
  const noDueDates = featuresOf(targetListName).noDueDates

  // The colour of whichever list the picker is currently showing. Read
  // from `listOptions` rather than the target: `Select.Value` renders the
  // *label* from that same array, so the dot beside it comes from the same
  // row and the two cannot describe different lists.
  const listColour = (listId: string): string | undefined =>
    listOptions.find((option) => option.value === listId)?.color

  const submit = (values: AddTodoForm): void => {
    // All-day when no time is given, zoned when there is
    // (docs/specs/todos.md — due times). `undefined` means the schema's
    // time-needs-a-date rule already rejected this, so it can't reach here.
    // Dropped outright on a media list, not merely hidden: the picker
    // lets you set a date and *then* choose a reading list, which would
    // otherwise file a due date the form is no longer showing you.
    // *(added 2026-08-05, issue #27.)*
    const due = noDueDates
      ? null
      : fieldsToDue({ date: values.due, time: values.dueTime })
    const todo: NewTodo = {
      uid: crypto.randomUUID(),
      summary: values.summary,
      ...(due ? { due } : {}),
      ...(values.description ? { description: values.description } : {}),
      ...(values.priority ? { priority: values.priority } : {}),
    }
    // The schema guarantees a non-empty listId whenever the picker is
    // shown, so this branch cannot lose a todo to an unset list.
    if (props.target.kind === 'global') {
      props.target.onAdd(values.listId, todo)
    } else {
      props.target.onAdd(todo)
    }
    reset({ ...EMPTY_VALUES, listId: defaultListId ?? '' })
    props.onOpenChange(false)
  }

  return (
    <Dialog.Root
      open={props.open}
      onOpenChange={(open) => {
        if (!open) reset({ ...EMPTY_VALUES, listId: defaultListId ?? '' })
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

            {/* The list picker, only on the global add path (issue #15).
                Above the Advanced accordion, not inside it: it is required
                here, and a required field hidden behind a disclosure is a
                form that fails validation pointing at something you cannot
                see. */}
            {pickList && (
              <Controller
                name="listId"
                control={control}
                render={({
                  field: { name, value, onChange },
                  fieldState: { invalid, error },
                }) => (
                  <Field.Root
                    className={styles['field']}
                    name={name}
                    invalid={invalid}
                  >
                    <Field.Label>List</Field.Label>
                    <Select.Root
                      items={listOptions}
                      value={value}
                      onValueChange={onChange}
                    >
                      <Select.Trigger className={styles['selectTrigger']}>
                        <span className={styles['selectValue']}>
                          {/* Only once a list is chosen. Against the
                              placeholder there is no list to be the colour
                              of, and an empty ring there would read as an
                              uncoloured list rather than as no answer —
                              the one thing the placeholder exists to say
                              (issue #15). */}
                          {value !== '' && (
                            <ListDot color={listColour(value)} />
                          )}
                          {/* No default list, deliberately (issue #15):
                              filing a todo somewhere the user never looked
                              is worse than asking. The placeholder says so
                              rather than showing a pre-selected list. */}
                          <Select.Value placeholder="Choose a list…" />
                        </span>
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
                                <span className={styles['selectValue']}>
                                  <ListDot color={option.color} />
                                  <Select.ItemText>
                                    {option.label}
                                  </Select.ItemText>
                                </span>
                              </Select.Item>
                            ))}
                          </Select.Popup>
                        </Select.Positioner>
                      </Select.Portal>
                    </Select.Root>
                    {error && (
                      <Field.Error className={styles['error']} match>
                        {error.message}
                      </Field.Error>
                    )}
                  </Field.Root>
                )}
              />
            )}

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
                      leaving it empty keeps the todo all-day.

                      Absent entirely on a media list (docs/specs/
                      list-kinds.md): a reading list holds things to get
                      to, not things due by a date. Hidden rather than
                      disabled — a greyed field invites "why can't I set
                      this?", while an absent one says the concept does
                      not apply. */}
                  {/* Two Controllers, one control — see the detail panel's
                      copy of this for why both fields must be in scope. */}
                  {!noDueDates && (
                    <Controller
                      name="dueTime"
                      control={control}
                      render={({ field: time, fieldState: { error } }) => (
                        <Controller
                          name="due"
                          control={control}
                          render={({ field: date }) => (
                            <DueControls
                              date={date.value}
                              time={time.value}
                              onDateChange={date.onChange}
                              onTimeChange={time.onChange}
                              onDateBlur={date.onBlur}
                              onTimeBlur={time.onBlur}
                              dateRef={date.ref}
                              timeRef={time.ref}
                              error={error?.message}
                            />
                          )}
                        />
                      )}
                    />
                  )}
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
                            className={cx(
                              styles['selectTrigger'],
                              PRIO_CLASS[value],
                            )}
                          >
                            <span className={styles['selectValue']}>
                              <span className={styles['prioSwatch']}>
                                {
                                  priorityChoice(value === '' ? null : value)
                                    .icon
                                }
                              </span>
                              <Select.Value />
                            </span>
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
                                    className={cx(
                                      styles['selectItem'],
                                      PRIO_CLASS[option.value],
                                    )}
                                  >
                                    <span className={styles['selectValue']}>
                                      <span className={styles['prioSwatch']}>
                                        {option.icon}
                                      </span>
                                      <Select.ItemText>
                                        {option.label}
                                      </Select.ItemText>
                                    </span>
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
