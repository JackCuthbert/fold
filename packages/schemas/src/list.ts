import { z } from 'zod'

// docs/specs/lists.md — colours and ordering. Both come from Apple
// extensions (`calendar-color` / `calendar-order` in the
// `http://apple.com/ns/ical/` namespace), so both are **optional**: a
// collection may carry neither, and a server may ignore them entirely
// (docs/specs/caldav-compliance.md).
//
// `color` is the stored 6-digit form — `parseListColor` (list-color.ts)
// normalizes the server's 8-digit value before it ever reaches here, so
// this schema is the guarantee that normalization actually happened.
export const todoListSchema = z.object({
  id: z.string().min(1),
  href: z.string().min(1),
  displayName: z.string().min(1),
  ctag: z.string(),
  color: z
    .string()
    .regex(/^#[0-9A-F]{6}$/, 'expected a normalized #RRGGBB colour')
    .optional(),
  order: z.int().optional(),
})
export type TodoList = z.infer<typeof todoListSchema>
