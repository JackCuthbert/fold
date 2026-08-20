import { describe, expect, it } from 'vitest'
import type { Command } from './commands'
import { filterCommands, groupCommands } from './command-filter'
import { LuPlus } from 'react-icons/lu'

// docs/specs/command-palette.md — filtering is fuzzy.

const command = (
  id: Command['id'],
  name: string,
  group: Command['group'],
): Command => ({ id, name, group, icon: LuPlus })

const ALL: readonly Command[] = [
  command('new-todo', 'New todo', 'create'),
  command('new-list', 'New list', 'create'),
  command('go-view:1', 'Today', 'view'),
  command('go-view:2', 'Tomorrow', 'view'),
  command('go-list:a', 'Chores', 'list'),
  command('go-list:b', 'Reading', 'list'),
  command('settings', 'Settings', 'app'),
]

describe('filterCommands', () => {
  it('returns everything, in order, for an empty query', () => {
    // Deliberately *not* run through the fuzzy matcher: with nothing typed
    // there is nothing to rank by, and letting Fuse order an unfiltered
    // list would shuffle the groups for no reason.
    expect(filterCommands(ALL, '')).toEqual(ALL)
    expect(filterCommands(ALL, '   ')).toEqual(ALL)
  })

  it('finds a command by a prefix of its name', () => {
    const names = filterCommands(ALL, 'tod').map((c) => c.name)
    expect(names).toContain('Today')
  })

  it('finds a list by part of its name', () => {
    // The one thing the palette can do that nothing else can, so the one
    // filter case that matters most.
    const names = filterCommands(ALL, 'chor').map((c) => c.name)
    expect(names).toContain('Chores')
  })

  it('ranks a prefix match above a later one', () => {
    // "New todo" starts with the query; "Today" contains it. Both match,
    // and the one you were probably typing should come first.
    const names = filterCommands(ALL, 'new').map((c) => c.name)
    expect(names[0]).toBe('New todo')
  })

  it('returns nothing when nothing matches', () => {
    expect(filterCommands(ALL, 'zzzzzz')).toEqual([])
  })
})

describe('groupCommands', () => {
  it('groups in display order, not match order', () => {
    const groups = groupCommands(ALL)
    expect(groups.map((g) => g.group)).toEqual([
      'create',
      'view',
      'list',
      'app',
    ])
  })

  it('drops a group with no commands left in it', () => {
    // What makes a heading disappear along with its rows while filtering,
    // rather than sitting over an empty space.
    const groups = groupCommands(filterCommands(ALL, 'chor'))
    expect(groups.map((g) => g.group)).toEqual(['list'])
  })

  it('keeps every command', () => {
    const total = groupCommands(ALL).reduce((n, g) => n + g.commands.length, 0)
    expect(total).toBe(ALL.length)
  })
})
