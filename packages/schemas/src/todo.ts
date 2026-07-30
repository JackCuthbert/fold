import { z } from 'zod'

export const todoDueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('date'), value: z.iso.date() }),
  z.object({
    kind: z.literal('date-time'),
    value: z.iso.datetime({ offset: true }),
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
