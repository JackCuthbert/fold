import { z } from 'zod'
import { todoListSchema } from './list'
import { newTodoSchema, todoChangesSchema, todoSchema } from './todo'

export const listsResponseSchema = z.array(todoListSchema)

export const todosResponseSchema = z.object({
  ctag: z.string(),
  todos: z.array(todoSchema),
})
export type TodosResponse = z.infer<typeof todosResponseSchema>

export const createListRequestSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
})
// docs/specs/lists.md — PATCH carries any subset of a list's mutable
// properties. `displayName` is optional now that colour and order can be
// changed on their own; at least one field must be present.
export const patchListRequestSchema = z
  .object({
    displayName: z.string().min(1).optional(),
    color: z
      .string()
      .regex(/^#[0-9A-F]{6}$/)
      .nullable()
      .optional(),
    order: z.int().nullable().optional(),
  })
  .refine(
    (value) =>
      value.displayName !== undefined ||
      value.color !== undefined ||
      value.order !== undefined,
    { message: 'PATCH must change at least one property' },
  )

/** @deprecated use patchListRequestSchema — kept until callers migrate. */
export const renameListRequestSchema = patchListRequestSchema

export const createTodoRequestSchema = newTodoSchema
export const updateTodoRequestSchema = z.object({
  etag: z.string().min(1),
  changes: todoChangesSchema,
})
export const deleteTodoRequestSchema = z.object({
  etag: z.string().min(1),
})

// 412 responses carry the fresh server copy for client rebase —
// see docs/specs/api.md (error mapping).
export const conflictResponseSchema = z.object({ todo: todoSchema })

export const apiErrorBodySchema = z.object({
  error: z.string(),
  message: z.string(),
})
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>
