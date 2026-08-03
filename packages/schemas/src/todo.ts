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
  // RFC 5545 CREATED, ISO-8601 UTC. Optional — todos written by other
  // clients need not carry one. Read-only: the client uses it purely as a
  // stable ordering tie-break (docs/specs/todos.md — ordering), so a new
  // todo lands where the server copy will and never jumps.
  created: z.iso.datetime().optional(),
  // RFC 5545 COMPLETED, ISO-8601 UTC — when the todo was finished. Absent
  // while a todo is open, and possibly absent even on a completed one,
  // since another client may set STATUS without it. Written by the server
  // when `completed` is set; surfaced here so the Summary view can group
  // finished work by day (docs/specs/summary-view.md).
  completedAt: z.iso.datetime().optional(),
})
export type Todo = z.infer<typeof todoSchema>

export const newTodoSchema = z.object({
  uid: z.string().min(1),
  summary: z.string().min(1),
  due: todoDueSchema.optional(),
  description: z.string().optional(),
  priority: todoPrioritySchema.optional(),
  // Set by the client at creation time so the optimistic placeholder sorts
  // exactly where the server copy will (docs/specs/todos.md — ordering).
  // The server writes this straight through to CREATED rather than
  // stamping its own, so the two can't disagree.
  created: z.iso.datetime().optional(),
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
