import { z } from 'zod'

// Four RFC 5545 DUE forms, preserved as sent — see
// docs/specs/todos.md#due-dates-and-timezones. Never convert between forms.
const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/

export const todoDueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('date'), value: z.iso.date() }),
  z.object({
    kind: z.literal('utc'),
    value: z.iso.datetime({ offset: false }),
  }),
  z.object({
    kind: z.literal('floating'),
    value: z.string().regex(LOCAL_DATE_TIME),
  }),
  z.object({
    kind: z.literal('zoned'),
    tzid: z.string().min(1),
    value: z.string().regex(LOCAL_DATE_TIME),
  }),
])
export type TodoDue = z.infer<typeof todoDueSchema>

export const todoPrioritySchema = z.enum(['high', 'medium', 'low'])
export type TodoPriority = z.infer<typeof todoPrioritySchema>

export const todoSchema = z.object({
  uid: z.string().min(1),
  listId: z.string().min(1),
  href: z.string().min(1),
  etag: z.string().min(1),
  summary: z.string(),
  completed: z.boolean(),
  due: todoDueSchema.optional(),
  description: z.string().optional(),
  priority: todoPrioritySchema.optional(),
})
export type Todo = z.infer<typeof todoSchema>

export const newTodoSchema = z.object({
  uid: z.string().min(1),
  summary: z.string().min(1),
  due: todoDueSchema.optional(),
  description: z.string().optional(),
  priority: todoPrioritySchema.optional(),
})
export type NewTodo = z.infer<typeof newTodoSchema>

// Partial edit; explicit null clears an optional property.
export const todoChangesSchema = z
  .object({
    summary: z.string().min(1),
    completed: z.boolean(),
    due: todoDueSchema.nullable(),
    description: z.string().nullable(),
    priority: todoPrioritySchema.nullable(),
  })
  .partial()
export type TodoChanges = z.infer<typeof todoChangesSchema>
