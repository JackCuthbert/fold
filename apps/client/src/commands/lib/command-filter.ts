import Fuse from 'fuse.js'
import type { Command, CommandGroup } from './commands'

// docs/specs/command-palette.md — filtering is fuzzy.
//
// Pure, and separate from the dialog: what the palette *shows* for a given
// query is a ranking question worth testing without rendering anything.

/** The palette's headings, in the order it shows them. */
export const COMMAND_GROUPS: readonly {
  group: CommandGroup
  heading: string
}[] = [
  { group: 'create', heading: 'Create' },
  { group: 'view', heading: 'Go to view' },
  { group: 'list', heading: 'Go to list' },
  { group: 'app', heading: 'App' },
]

export interface GroupedCommands {
  group: CommandGroup
  heading: string
  commands: readonly Command[]
}

/**
 * The commands matching `query`, best first.
 *
 * `fuse.js` rather than a hand-rolled substring match, because [search]
 * and quick add's `#` autocomplete already rank names with it — three ways
 * of finding something by typing part of it should agree on what "part of
 * it" means.
 *
 * **An empty query returns everything untouched.** Running a blank search
 * through Fuse would impose a ranking on a list nobody has filtered, which
 * shuffles the groups for no reason: with nothing typed there is nothing
 * to be more or less relevant to.
 */
export function filterCommands(
  commands: readonly Command[],
  query: string,
): readonly Command[] {
  const trimmed = query.trim()
  if (trimmed === '') return commands

  const fuse = new Fuse(commands, {
    keys: ['name'],
    // Tighter than search's 0.4: this is a closed list of a dozen or so
    // short names the user is picking from, not a haystack of prose, and a
    // loose threshold here surfaces "Settings" for "tod".
    threshold: 0.3,
    // Ranks a match near the start of the name above one buried later, so
    // typing "new" offers "New todo" before "Tomorrow".
    ignoreLocation: false,
  })
  return fuse.search(trimmed).map((hit) => hit.item)
}

/**
 * The same commands, arranged under their headings.
 *
 * **Display order, not match order.** The groups are a fixed frame — the
 * things you make, the places you go, the app itself — and reordering them
 * by whichever matched best would move the furniture under the reader
 * between keystrokes. Ranking still decides the order *within* a group.
 *
 * A group with nothing in it is dropped, which is what makes a heading
 * disappear along with its rows rather than sitting over a gap.
 */
export function groupCommands(
  commands: readonly Command[],
): readonly GroupedCommands[] {
  return COMMAND_GROUPS.map(({ group, heading }) => ({
    group,
    heading,
    commands: commands.filter((command) => command.group === group),
  })).filter((entry) => entry.commands.length > 0)
}
