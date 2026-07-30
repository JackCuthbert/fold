import { z } from 'zod'

export const todoListSchema = z.object({
  id: z.string().min(1),
  href: z.string().min(1),
  displayName: z.string().min(1),
  ctag: z.string(),
})
export type TodoList = z.infer<typeof todoListSchema>
