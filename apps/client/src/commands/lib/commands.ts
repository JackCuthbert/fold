import type { IconType } from 'react-icons'
import {
  LuCalendarRange,
  LuCircleHelp,
  LuHistory,
  LuLogOut,
  LuPlus,
  LuSearch,
  LuSettings,
  LuSun,
  LuSunrise,
} from 'react-icons/lu'
import {
  DERIVED_VIEWS,
  NEXT_7_DAYS_VIEW,
  SEARCH_VIEW,
  SUMMARY_VIEW,
  TODAY_VIEW,
  TOMORROW_VIEW,
} from '../../todos/lib/today'

/**
 * What the app can be asked to do (docs/specs/command-palette.md).
 *
 * **A command is the thing; a shortcut is a key that runs one.** Most
 * commands have no shortcut and never will — Settings and Sign out are
 * reachable from one place each, and a list created this afternoon cannot
 * have been assigned a chord. That asymmetry is why this is its own module
 * rather than a widening of `SHORTCUTS`, whose entries require a key by
 * definition: adding keyless entries there would have meant either
 * inventing chords or keeping a type called `Shortcut` that describes
 * things with no keys.
 *
 * Pure data and pure functions, no React: the palette renders this, the
 * help modal reads names out of it, and both can be tested without a DOM.
 */

/** The headings the palette groups by, in the order it shows them. */
export type CommandGroup = 'create' | 'go' | 'app'

/**
 * `go-view:<n>` is the nth derived view, numbered from 1 in nav order
 * (todos/lib/today.ts — DERIVED_VIEWS), matching the shortcut map's own
 * scheme. `go-list:<id>` is a list, by its CalDAV collection id.
 */
export type CommandId =
  | 'new-todo'
  | 'new-list'
  | 'palette'
  | 'help'
  | 'settings'
  | 'sign-out'
  | `go-view:${number}`
  | `go-list:${string}`

export interface Command {
  id: CommandId
  /** What the palette and the help modal call it. */
  name: string
  group: CommandGroup
  icon: IconType
}

/** The `go-list:` id for a list. */
export function listCommandId(listId: string): CommandId {
  return `go-list:${listId}`
}

/**
 * The list a `go-list:` command names, or null for any other command.
 *
 * Splits on the *first* separator rather than the last, and takes
 * everything after it: a CalDAV collection id is opaque and arrives from
 * the server, so a colon inside one is not ours to rule out.
 */
export function listIdOf(id: CommandId): string | null {
  const prefix = 'go-list:'
  if (!id.startsWith(prefix)) return null
  return id.slice(prefix.length)
}

/** The 1-based index a `go-view:` command refers to, or null. */
export function viewIndexOf(id: CommandId): number | null {
  const prefix = 'go-view:'
  if (!id.startsWith(prefix)) return null
  const index = Number(id.slice(prefix.length))
  return Number.isInteger(index) ? index : null
}

/**
 * What each derived view is called, and the icon it carries.
 *
 * The icons are the nav's own (lists/list-nav) rather than a second set
 * chosen here: the palette is a different route to the same places, and a
 * view that looks like one thing in the sidebar and another in the palette
 * would read as two different destinations.
 */
const VIEW_PRESENTATION: Record<string, { name: string; icon: IconType }> = {
  [TODAY_VIEW]: { name: 'Today', icon: LuSun },
  [TOMORROW_VIEW]: { name: 'Tomorrow', icon: LuSunrise },
  [NEXT_7_DAYS_VIEW]: { name: 'Next 7 days', icon: LuCalendarRange },
  [SUMMARY_VIEW]: { name: 'Summary', icon: LuHistory },
  [SEARCH_VIEW]: { name: 'Search', icon: LuSearch },
}

/**
 * One command per derived view, generated from the nav's own order so a
 * view added to `DERIVED_VIEWS` appears here without a change.
 *
 * Falls back to the view id for a name, matching what the shortcut map did
 * before this: a view added without presentation still gets a working
 * command rather than a crash.
 */
const VIEW_COMMANDS: readonly Command[] = DERIVED_VIEWS.map((view, index) => ({
  id: `go-view:${index + 1}` as const,
  name: VIEW_PRESENTATION[view]?.name ?? view,
  group: 'go' as const,
  icon: VIEW_PRESENTATION[view]?.icon ?? LuSearch,
}))

/**
 * Every command that does not depend on the user's data.
 *
 * Lists are deliberately absent: they are generated per render from the
 * lists themselves (use-commands.ts), because they change while the app is
 * running and a static array cannot.
 */
export const COMMANDS: readonly Command[] = [
  { id: 'new-todo', name: 'New todo', group: 'create', icon: LuPlus },
  { id: 'new-list', name: 'New list', group: 'create', icon: LuPlus },
  ...VIEW_COMMANDS,
  { id: 'settings', name: 'Settings', group: 'app', icon: LuSettings },
  { id: 'help', name: 'Help', group: 'app', icon: LuCircleHelp },
  { id: 'sign-out', name: 'Sign out', group: 'app', icon: LuLogOut },
]

/**
 * The command with this id, or undefined.
 *
 * Static commands only — a `go-list:` id resolves against the lists that
 * exist right now, which is `useCommands`' job rather than this module's.
 */
export function commandById(id: CommandId): Command | undefined {
  return COMMANDS.find((command) => command.id === id)
}
