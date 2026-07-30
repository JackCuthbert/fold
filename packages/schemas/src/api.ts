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
export const renameListRequestSchema = z.object({
  displayName: z.string().min(1),
})

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
