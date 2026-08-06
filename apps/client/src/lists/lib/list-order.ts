import type { TodoList } from '@fold/schemas'

/**
 * List ordering — docs/specs/lists.md (ordering).
 *
 * Lists carrying Apple's `calendar-order` sort by it; lists without one
 * sort alphabetically *after* them. That second group exists because a
 * list created by another client may have no order at all, and because a
 * server may ignore the property entirely — in which case every list falls
 * into it and the nav is alphabetical, exactly as it was before this
 * feature (docs/specs/lists.md — degradation).
 */

const byName = (a: TodoList, b: TodoList): number =>
  a.displayName.localeCompare(b.displayName)

/** The one ordering rule, used on read and on optimistic insert alike. */
export const byListOrder = (a: TodoList, b: TodoList): number => {
  // `!== undefined`, never `??` or truthiness: `0` is a real position and
  // must sort first, not be mistaken for an absent order.
  const aOrder = a.order
  const bOrder = b.order
  if (aOrder !== undefined && bOrder !== undefined) {
    const diff = aOrder - bOrder
    return diff !== 0 ? diff : byName(a, b)
  }
  if (aOrder !== undefined) return -1
  if (bOrder !== undefined) return 1
  return byName(a, b)
}

/**
 * The order to give a newly created list: one past the highest in use.
 *
 * The **client** picks this, not the server, so the two can never disagree
 * about where a new list belongs — the guarantee that a new list never
 * appears in one position and jumps to another when the response lands
 * (docs/specs/lists.md; this is the 2026-08-01 regression that must not
 * return).
 */
export function nextOrder(lists: readonly TodoList[]): number {
  const orders = lists
    .map((list) => list.order)
    .filter((order): order is number => order !== undefined)
  if (orders.length === 0) return 1
  return Math.max(...orders) + 1
}

export interface OrderChange {
  listId: string
  order: number
}

/**
 * Moving one list up or down: the orders that need writing, and nothing
 * else. Swapping two adjacent lists swaps two numbers — two PROPPATCHes,
 * not a renumber of the whole nav (docs/specs/lists.md — reordering writes
 * only what moved).
 *
 * Returns `[]` at either end, so the caller can disable the control.
 */
export function reorder(
  lists: readonly TodoList[],
  listId: string,
  direction: 'up' | 'down',
): OrderChange[] {
  const sorted = lists.toSorted(byListOrder)
  const index = sorted.findIndex((list) => list.id === listId)
  if (index === -1) return []
  const neighbourIndex = direction === 'up' ? index - 1 : index + 1
  const moved = sorted[index]
  const neighbour = sorted[neighbourIndex]
  if (!moved || !neighbour) return []

  // Both may be unordered — a nav built entirely by another client. Fall
  // back to their current positions, which the sort above already agrees
  // with, so the swap lands where the user expects.
  const movedOrder = moved.order ?? index + 1
  const neighbourOrder = neighbour.order ?? neighbourIndex + 1

  // If they tie (or both defaulted to the same number), force a gap so the
  // swap actually changes the sort rather than resolving to the same
  // alphabetical tiebreak.
  if (movedOrder === neighbourOrder) {
    return direction === 'up'
      ? [
          { listId: moved.id, order: movedOrder - 1 },
          { listId: neighbour.id, order: movedOrder },
        ]
      : [
          { listId: moved.id, order: movedOrder + 1 },
          { listId: neighbour.id, order: movedOrder },
        ]
  }

  return [
    { listId: moved.id, order: neighbourOrder },
    { listId: neighbour.id, order: movedOrder },
  ]
}
