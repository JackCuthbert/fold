import { describe, expect, it } from 'vitest'
import { SHORTCUTS } from '../../shortcuts/lib/shortcuts'
import { DERIVED_VIEWS } from '../../todos/lib/today'
import { COMMANDS, commandById, listCommandId, listIdOf } from './commands'

// docs/specs/command-palette.md — commands and shortcuts are different
// things. These tests exist to keep the two files honest with each other:
// a command is what the palette offers, a shortcut is a key that runs one,
// and most commands have neither.

describe('COMMANDS', () => {
  it('gives every command a name and a group', () => {
    for (const command of COMMANDS) {
      expect(command.name.length, command.id).toBeGreaterThan(0)
      expect(['create', 'go', 'app'], command.id).toContain(command.group)
    }
  })

  it('has no duplicate ids', () => {
    const ids = COMMANDS.map((command) => command.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('covers every derived view', () => {
    // One `go-view:` command per view in the nav, so a view added to
    // today.ts without a command here fails rather than going missing
    // from the palette.
    const views = COMMANDS.filter((command) =>
      command.id.startsWith('go-view:'),
    )
    expect(views).toHaveLength(DERIVED_VIEWS.length)
  })
})

describe('every shortcut names a command that exists', () => {
  // The check the split is *for*. A binding whose command was renamed or
  // removed would otherwise render a blank row in the help modal and do
  // nothing in the palette — both silent.
  it.each(SHORTCUTS.map((shortcut) => [shortcut.command] as const))(
    '%s',
    (command) => {
      expect(commandById(command)).toBeDefined()
    },
  )
})

describe('list commands', () => {
  it('round-trips a list id', () => {
    const id = listCommandId('abc-123')
    expect(listIdOf(id)).toBe('abc-123')
  })

  it('returns null for a command that is not a list', () => {
    expect(listIdOf('new-todo')).toBeNull()
    expect(listIdOf('go-view:1')).toBeNull()
  })

  it('survives a list id containing the separator', () => {
    // CalDAV collection ids are opaque and arrive from the server, so a
    // colon in one is not ours to rule out. Splitting on the *first*
    // separator is what makes that safe.
    const id = listCommandId('weird:id:here')
    expect(listIdOf(id)).toBe('weird:id:here')
  })
})
