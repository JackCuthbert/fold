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
  // docs/specs/todos.md — moving a todo between lists. One entry, not a
  // createTodo plus a deleteTodo: the copy and the delete must retry as a
  // unit, or a failure between them strands a duplicate with nothing
  // recording that the two belonged together. `listId` is the source (so
  // the field means the same thing in every mutation) and `todo` carries
  // the full body to re-create, since the source resource is gone by the
  // time a retry runs.
  z.object({
    ...base,
    kind: z.literal('moveTodo'),
    listId,
    targetListId: z.string().min(1),
    uid,
    etag: z.string().min(1),
    todo: newTodoSchema,
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
