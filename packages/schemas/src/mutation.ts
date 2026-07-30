import { z } from 'zod'
import { newTodoSchema, todoChangesSchema } from './todo'

const base = { id: z.uuid() }
const listId = z.string().min(1)
const uid = z.string().min(1)

// Outbox entries. Validated when read back from storage —
// see docs/specs/sync-and-offline.md.
export const mutationSchema = z.discriminatedUnion('kind', [
  z.object({
    ...base,
    kind: z.literal('createTodo'),
    listId,
    todo: newTodoSchema,
  }),
  z.object({
    ...base,
    kind: z.literal('updateTodo'),
    listId,
    uid,
    etag: z.string().min(1),
    changes: todoChangesSchema,
  }),
  z.object({
    ...base,
    kind: z.literal('deleteTodo'),
    listId,
    uid,
    etag: z.string().min(1),
  }),
  z.object({
    ...base,
    kind: z.literal('createList'),
    listId,
    displayName: z.string().min(1),
  }),
  z.object({
    ...base,
    kind: z.literal('renameList'),
    listId,
    displayName: z.string().min(1),
  }),
  z.object({ ...base, kind: z.literal('deleteList'), listId }),
])
export type Mutation = z.infer<typeof mutationSchema>
