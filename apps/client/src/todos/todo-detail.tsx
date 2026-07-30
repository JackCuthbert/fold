import {
  todoPrioritySchema,
  type Todo,
  type TodoChanges,
} from '@caldav-todo/schemas'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { dueInstant } from './sort'

const detailSchema = z.object({
  summary: z.string().min(1),
  due: z.string(), // '' or yyyy-mm-dd from <input type="date">
  description: z.string(),
  priority: z.union([todoPrioritySchema, z.literal('')]),
})
type DetailForm = z.infer<typeof detailSchema>

/** Local yyyy-mm-dd for <input type="date"> (not UTC — toISOString shifts). */
const toDateInputValue = (date: Date): string =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')

// Detail edit — docs/specs/todos.md.
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

  const { register, handleSubmit } = useForm<DetailForm>({
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
    <section className="detail" aria-label="Edit todo">
      <form onSubmit={handleSubmit(submit)}>
        <label>
          Summary
          <input {...register('summary')} />
        </label>
        <label>
          Due
          <input type="date" {...register('due')} />
        </label>
        <label>
          Priority
          <select {...register('priority')}>
            <option value="">None</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label>
          Notes
          <textarea rows={4} {...register('description')} />
        </label>
        <div className="detail__actions">
          <button type="submit">Save</button>
          <button type="button" onClick={props.onClose}>
            Close
          </button>
          <button
            type="button"
            className="detail__delete"
            onClick={props.onDelete}
          >
            Delete
          </button>
        </div>
      </form>
    </section>
  )
}
