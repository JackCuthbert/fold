import { useMemo } from 'react'
import { LuList } from 'react-icons/lu'
import { useListFilter } from '../../shell/context/list-filter-context'
import { PALETTE_COMMANDS, listCommandId, type Command } from './commands'

/**
 * Every command the palette can offer right now: the fixed ones, plus one
 * per list (docs/specs/command-palette.md — what is in it).
 *
 * Lists cannot live in the static array because they are the user's data:
 * they arrive from the server, change while the app is running, and are
 * the one thing in the inventory that can never have a keyboard chord —
 * which is exactly why the palette is worth having.
 *
 * **`allLists`, not `shownLists`.** A hidden list (docs/specs/list-filter.md)
 * is hidden from the *nav*, which is a statement about what you want to
 * see every day rather than about what exists. Reaching one by name is the
 * case the palette answers best, and omitting them would make the palette
 * unable to find precisely the lists that are hardest to get to.
 */
export function useCommands(): readonly Command[] {
  const { allLists } = useListFilter()

  return useMemo(
    () => [
      ...PALETTE_COMMANDS,
      ...allLists.map((list): Command => ({
        id: listCommandId(list.id),
        name: list.displayName,
        group: 'list',
        // The list's own colour dot, exactly as the nav draws it
        // (lists/list-dot). The icon is a fallback the palette never
        // reaches for a list, kept so the type stays uniform.
        icon: LuList,
        color: list.color,
        isList: true,
      })),
    ],
    [allLists],
  )
}
