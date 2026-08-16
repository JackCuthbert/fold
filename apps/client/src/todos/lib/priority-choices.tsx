import type { TodoPriority } from '@fold/schemas'
import type { ReactNode } from 'react'
import { LuChevronDown, LuChevronUp, LuCircle, LuMinus } from 'react-icons/lu'

/**
 * The four priority choices, with the glyph each one shows.
 *
 * docs/specs/todos.md — priority. One list, because four surfaces now
 * offer this choice: the row's context menu, the detail panel's dropdown,
 * the add-todo modal's, and (as a read-only mark) the row's meta pill.
 * Two of those already held their own copy of the option list, which is
 * the drift `styles/priority.module.css` exists to prevent for the colour
 * — the labels and glyphs deserve the same treatment.
 * *(added 2026-08-11.)*
 *
 * **The glyph carries the rank**, so the meaning survives for anyone who
 * cannot separate the hues, and it distinguishes priority from the overdue
 * pill that shares its red (docs/specs/ui.md — icons, not colour alone).
 * The same marks the meta pill uses, so a chevron-up means "high"
 * everywhere in the app.
 */
export interface PriorityChoice {
  /** `null` is "no priority" — a value you set, not a fourth rank. */
  value: TodoPriority | null
  label: string
  icon: ReactNode
}

/**
 * `size` differs by glyph on purpose.
 *
 * Every icon here is drawn into a box of the size given, but the *ink*
 * inside that box varies a lot: measured in the browser, the chevrons
 * paint 12×6 of their 24-unit viewBox and the circle paints 20×20. Left at
 * one nominal size the circle towered over the ranks beside it, so it is
 * stepped down to match their weight rather than their box.
 * *(measured 2026-08-11.)*
 */
export const PRIORITY_CHOICES: readonly PriorityChoice[] = [
  {
    value: 'high',
    label: 'High',
    icon: <LuChevronUp aria-hidden="true" size={14} />,
  },
  {
    value: 'medium',
    label: 'Medium',
    icon: <LuMinus aria-hidden="true" size={14} />,
  },
  {
    value: 'low',
    label: 'Low',
    icon: <LuChevronDown aria-hidden="true" size={14} />,
  },
  {
    value: null,
    // An empty ring is already the app's mark for "nothing set" — it is
    // what an uncoloured list shows in the nav (lists/list-dot).
    label: 'None',
    icon: <LuCircle aria-hidden="true" size={10} />,
  },
]

/** The choice a todo is currently on. Always found — `None` is the last. */
export function priorityChoice(
  priority: TodoPriority | null | undefined,
): PriorityChoice {
  const found = PRIORITY_CHOICES.find(
    (choice) => choice.value === (priority ?? null),
  )
  // The four choices cover the whole union plus null, so this is
  // unreachable; the fallback keeps the return type honest without an
  // assertion.
  return found ?? { value: null, label: 'None', icon: null }
}
