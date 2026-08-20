import type { IconType } from 'react-icons'
import {
  LuCalendarRange,
  LuCircleHelp,
  LuTerminal,
  LuHistory,
  LuListPlus,
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

/**
 * The headings the palette groups by, in the order it shows them.
 *
 * Views and lists are separate groups rather than one "Go to", because
 * they are different kinds of destination: the views are fixed, chorded
 * and the same in every install, while the lists are the user's own data
 * and can be renamed, reordered or deleted. Putting them under one heading
 * made a nav's worth of list names look like more views.
 * *(split 2026-08-20, on review.)*
 */
export type CommandGroup = 'create' | 'view' | 'list' | 'app'

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
  /**
   * What the palette calls it — a bare noun, because the group heading
   * above it already supplies the verb: "Today" under "Go to", not "Go to
   * Today" thirty times down the list.
   */
  name: string
  /**
   * What the help modal calls it — the same thing as a whole phrase.
   *
   * The two differ because the surfaces do. A list of key bindings has no
   * headings to lean on, so each row has to say what its key *does*:
   * "Open Help", "Go to Today". Naming them identically would make one of
   * the two read wrongly, and this was found by the help modal's own test
   * when the palette's nouns were used for both.
   * *(added 2026-08-20, during implementation.)*
   */
  phrase?: string
  group: CommandGroup
  icon: IconType
  /**
   * A list's own colour, for the dot the palette draws instead of an icon.
   *
   * Only `go-list:` commands have one, and it is what makes a list row
   * recognisable at a glance: the nav marks every list with this dot
   * (lists/list-dot), so a palette that drew a generic icon instead would
   * be showing the same list as two different things. `undefined` on a
   * list means no colour is set, which the dot renders as an unfilled
   * ring rather than as nothing. *(added 2026-08-20, on review.)*
   */
  color?: string | undefined
  /** True for a list, which draws a colour dot rather than its icon. */
  isList?: boolean
}

/** What the help modal calls a command: its phrase, or its name. */
export function commandPhrase(command: Command): string {
  return command.phrase ?? command.name
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
  phrase: `Go to ${VIEW_PRESENTATION[view]?.name ?? view}`,
  group: 'view' as const,
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
  // `LuListPlus`, not the plain `LuPlus` the nav uses for this: there the
  // button stands alone, while here the two Create rows sit one above the
  // other and identical icons made them read as one repeated item.
  // *(changed 2026-08-20, on review.)*
  { id: 'new-list', name: 'New list', group: 'create', icon: LuListPlus },
  ...VIEW_COMMANDS,
  // The palette itself, so the help modal names `Ctrl+K` like any other
  // chord. It is deliberately *not* offered as a row inside the palette —
  // see `PALETTE_COMMANDS` below.
  {
    id: 'palette',
    name: 'Commands',
    phrase: 'Open the command palette',
    group: 'app',
    icon: LuTerminal,
  },
  {
    id: 'settings',
    name: 'Settings',
    phrase: 'Open Settings',
    group: 'app',
    icon: LuSettings,
  },
  {
    id: 'help',
    name: 'Help',
    phrase: 'Open Help',
    group: 'app',
    icon: LuCircleHelp,
  },
]

/**
 * **Sign out is deliberately not a command.**
 *
 * The spec listed it, and it was built and removed the same day. Signing
 * out is not one call: it logs out, clears the read cache, drops the
 * persisted client and clears the session, in that order and for reasons
 * each documented at the button (lists/settings-modal). A command would
 * have to either duplicate that sequence — a second place to keep a
 * security-relevant order correct — or reach into the modal to press its
 * button.
 *
 * Neither is worth it for an action performed rarely and deliberately, and
 * the palette already offers Settings, which is one keystroke from it.
 * *(changed 2026-08-20, during implementation.)*
 */

/**
 * The command with this id, or undefined.
 *
 * Static commands only — a `go-list:` id resolves against the lists that
 * exist right now, which is `useCommands`' job rather than this module's.
 */
/**
 * The commands the palette offers, which is every command except itself.
 *
 * "Commands" as a row *inside* the commands list is a mirror facing a
 * mirror: it can only reopen what is already open. It stays in `COMMANDS`
 * so the help modal can name the chord, and is filtered out here.
 */
export const PALETTE_COMMANDS: readonly Command[] = COMMANDS.filter(
  (command) => command.id !== 'palette',
)

export function commandById(id: CommandId): Command | undefined {
  return COMMANDS.find((command) => command.id === id)
}
