import type { TodoList } from '@fold/schemas'
import { describe, expect, it } from 'vitest'
import { parseQuickAdd, replaceToken } from './quick-add'

const list = (id: string, displayName: string): TodoList => ({
  id,
  href: `/${id}`,
  displayName,
  ctag: 'c',
})

const LISTS = [
  list('c', 'Chores'),
  list('w', 'Work'),
  list('h', 'Health'),
  list('cw', 'Chores (work)'),
]

// Fixed reference: Friday 14 August 2026, 9am local. Every date assertion
// is relative to this rather than to the day the suite runs
// (docs/specs/testing.md), so a test cannot start failing overnight.
const NOW = new Date('2026-08-14T09:00:00')

const parse = (text: string) => parseQuickAdd(text, LISTS, NOW)

// docs/specs/quick-add.md — the grammar.
describe('parseQuickAdd', () => {
  it('reads the whole grammar out of one line', () => {
    const result = parse('Clean the gutters tomorrow at 3pm #chores p1')
    expect(result.summary).toBe('Clean the gutters')
    expect(result.due).toEqual({ date: '2026-08-15', time: '15:00' })
    expect(result.listId).toBe('c')
    expect(result.priority).toBe('high')
  })

  it('takes the tokens in any order', () => {
    // The same four facts, rearranged. Order is not part of the grammar,
    // so every arrangement has to land the same todo.
    const expected = {
      summary: 'Clean the gutters',
      due: { date: '2026-08-15', time: '15:00' },
      listId: 'c',
      priority: 'high',
    }
    expect(parse('p1 #chores tomorrow at 3pm Clean the gutters')).toMatchObject(
      expected,
    )
    expect(parse('Clean #chores the gutters p1 tomorrow at 3pm')).toMatchObject(
      expected,
    )
  })

  describe('the summary is what is left', () => {
    it('is the bare text with no tokens at all', () => {
      const result = parse('Buy milk')
      expect(result.summary).toBe('Buy milk')
      expect(result.due).toBeUndefined()
      expect(result.listId).toBeUndefined()
      expect(result.priority).toBeUndefined()
    })

    it('collapses the whitespace a stripped token leaves behind', () => {
      // "Ring   mum" with two gaps where `p2` and the date were is the
      // tell-tale of a naive strip.
      expect(parse('Ring p2 mum tomorrow').summary).toBe('Ring mum')
    })

    it('keeps an emoji intact, and the tokens around it aligned', () => {
      // Token offsets are UTF-16 indices, so stripping by code point would
      // both mangle the emoji and shift every offset after it. The rocket
      // sits *before* the tokens precisely so a mis-indexed strip shows up
      // as the wrong characters being removed.
      const result = parse('Ship it 🚀 tomorrow p1')
      expect(result.summary).toBe('Ship it 🚀')
      expect(result.due?.date).toBe('2026-08-15')
      expect(result.priority).toBe('high')
    })

    it('is empty when the line is nothing but tokens', () => {
      // Refused at the call site rather than here — the parser reports,
      // it does not decide (docs/specs/quick-add.md — failure cases).
      expect(parse('tomorrow #chores p1').summary).toBe('')
    })
  })

  describe('dates', () => {
    it('reads a bare day as all-day, with no time', () => {
      expect(parse('Water the plants tomorrow').due).toEqual({
        date: '2026-08-15',
        time: '',
      })
    })

    it('reads a time as a time, on today when no day is given', () => {
      expect(parse('Standup 9:30am').due).toEqual({
        date: '2026-08-14',
        time: '09:30',
      })
    })

    it('resolves a weekday forwards', () => {
      // From the Friday reference: Saturday is tomorrow, Monday is the
      // 17th. Both asserted, so a bug that lands every weekday on the same
      // day would still fail.
      expect(parse('Call the dentist saturday').due?.date).toBe('2026-08-15')
      expect(parse('Call the dentist monday').due?.date).toBe('2026-08-17')
    })

    it('reads a weekday naming today as today', () => {
      // "friday" said on a Friday means today, which is the conventional
      // reading; `next friday` is the following week. Asserted because it
      // is the one date behaviour that surprises people
      // (docs/specs/quick-add.md — dates come from a library).
      expect(parse('Submit it friday').due?.date).toBe('2026-08-14')
      expect(parse('Submit it next friday').due?.date).toBe('2026-08-21')
    })

    it('handles relative and absolute forms', () => {
      expect(parse('Water the plants in 3 days').due?.date).toBe('2026-08-17')
      expect(parse('Pay the bill 25 Aug').due?.date).toBe('2026-08-25')
    })

    // The property that matters more than coverage: a parser that turns
    // "chapter 3" into the 3rd is worse than no parser at all.
    it.each([
      ['Read chapter 3', 'Read chapter 3'],
      ['Update the v2 spec', 'Update the v2 spec'],
      ['Buy 2 pints of milk', 'Buy 2 pints of milk'],
    ])('leaves %j alone', (input, summary) => {
      const result = parse(input)
      expect(result.due).toBeUndefined()
      expect(result.summary).toBe(summary)
    })
  })

  describe('lists', () => {
    it('matches a list by name, case-insensitively', () => {
      expect(parse('Sweep #chores').listId).toBe('c')
      expect(parse('Sweep #Chores').listId).toBe('c')
    })

    it('leaves an unmatched # in the summary', () => {
      // `#12` is not a list, so nothing is consumed and the text stands —
      // "Fix issue #12" is an ordinary todo, not a filing error.
      const result = parse('Fix issue #12')
      expect(result.listId).toBeUndefined()
      expect(result.summary).toBe('Fix issue #12')
    })

    it('prefers an exact name over a longer one that contains it', () => {
      // Both "Chores" and "Chores (work)" start with the typed token. The
      // autocomplete is what normally resolves this, but a typed-through
      // token must not silently pick the longer name.
      expect(parse('Sweep #chores').listId).toBe('c')
    })
  })

  describe('priority', () => {
    it.each([
      ['p1', 'high'],
      ['p2', 'medium'],
      ['p3', 'low'],
    ])('maps %s to %s', (token, priority) => {
      expect(parse(`Thing ${token}`).priority).toBe(priority)
    })

    it('leaves p4 alone, since no priority is already the default', () => {
      // Todoist's p4 means "no priority", and it was briefly consumed to
      // set nothing. That made it the one token whose highlight in the
      // input matched no change in the pills — the Priority pill sat
      // exactly as before — so it read as doing nothing while claiming to
      // have been understood. Now it is ordinary text.
      // *(changed 2026-08-14, found in review.)*
      const result = parse('Thing p4')
      expect(result.priority).toBeUndefined()
      expect(result.summary).toBe('Thing p4')
      expect(result.tokens).toEqual([])
    })

    it('ignores a priority-shaped word that is part of the text', () => {
      // Only a standalone token counts, so a product name survives.
      const result = parse('Order p1000 connectors')
      expect(result.priority).toBeUndefined()
      expect(result.summary).toBe('Order p1000 connectors')
    })
  })

  describe('the matched ranges', () => {
    it('reports where each token was, so the input can dim them', () => {
      const text = 'Sweep #chores p1'
      const result = parse(text)
      const matched = result.tokens.map((t) => text.slice(t.start, t.end))
      expect(matched).toContain('#chores')
      expect(matched).toContain('p1')
    })

    it('reports nothing for a line with no tokens', () => {
      expect(parse('Buy milk').tokens).toEqual([])
    })

    // The bug this guards against renders as doubled text in the input:
    // the dimming layer walks the tokens in order and slices between them,
    // so a token that starts *before* the previous one ended makes the
    // slice run backwards and repeat what it already emitted. Seen as
    // "…#Chores3pm#Chores 3pm" *(found in review 2026-08-14)*.
    it('never reports overlapping ranges', () => {
      // chrono reads the blanked text, so its date range can extend across
      // where a #list or priority token sat — "next week #chores 3pm" is
      // the case that produced it.
      const result = parse('Do the thing next week #chores 3pm')
      const sorted = result.tokens.toSorted((a, b) => a.start - b.start)
      for (const [index, token] of sorted.entries()) {
        const next = sorted[index + 1]
        if (next) expect(token.end).toBeLessThanOrEqual(next.start)
      }
    })

    it('still parses that line correctly', () => {
      const result = parse('Do the thing next week #chores 3pm')
      expect(result.summary).toBe('Do the thing')
      expect(result.listId).toBe('c')
      expect(result.due?.time).toBe('15:00')
    })
  })
})

// docs/specs/quick-add.md — the preview pills edit the text.
//
// The pills are interactive, and what they change is the *text*: choosing a
// different list from the `#chores` pill rewrites the token, and the parse
// follows from the text as if it had been typed. That is what keeps one
// source of truth while still allowing a pointer to drive it.
describe('replaceToken', () => {
  const listToken = (text: string) => {
    const found = parseQuickAdd(text, LISTS, NOW).tokens.find(
      (t) => t.kind === 'list',
    )
    if (!found) throw new Error('expected a list token')
    return found
  }

  it('swaps a token for another, leaving the rest alone', () => {
    const text = 'Sweep the floor #chores tomorrow'
    expect(replaceToken(text, listToken(text), '#Work')).toBe(
      'Sweep the floor #Work tomorrow',
    )
  })

  it('re-parses to the new value', () => {
    // The point of rewriting text rather than holding state: the result is
    // whatever the parser makes of the new line.
    const text = 'Sweep the floor #chores'
    const swapped = replaceToken(text, listToken(text), '#Work')
    expect(parseQuickAdd(swapped, LISTS, NOW).listId).toBe('w')
  })

  it('removes a token when the replacement is empty', () => {
    const text = 'Sweep the floor #chores tomorrow'
    const cleared = replaceToken(text, listToken(text), '')
    expect(cleared).toBe('Sweep the floor tomorrow')
    expect(parseQuickAdd(cleared, LISTS, NOW).listId).toBeUndefined()
  })

  it('appends when the token is not in the text yet', () => {
    // Setting a list on a line that names none — the pill has nothing to
    // rewrite, so the token is added at the end.
    expect(replaceToken('Sweep the floor', undefined, '#Work')).toBe(
      'Sweep the floor #Work',
    )
  })

  it('does not double the space when appending to a trailing space', () => {
    expect(replaceToken('Sweep the floor ', undefined, '#Work')).toBe(
      'Sweep the floor #Work',
    )
  })

  it('appends nothing to an empty line when clearing', () => {
    expect(replaceToken('Sweep', undefined, '')).toBe('Sweep')
  })
})

// The e2e suite names its lists `prefix-<timestamp>-<rand>`, and the list
// pill writes that name back into the text as a `#token`. Digits and
// hyphens are exactly what a name-shaped pattern tends to stop at, so the
// round-trip is asserted on a real generated name rather than on `#chores`.
describe('a generated list name round-trips', () => {
  it('matches a name with digits and hyphens', () => {
    const generated = 'add-1786702428675-481582'
    const lists = [list('g', generated)]
    const result = parseQuickAdd(
      `Made from a derived view #${generated}`,
      lists,
      NOW,
    )
    expect(result.listId).toBe('g')
    expect(result.summary).toBe('Made from a derived view')
  })
})

// docs/specs/list-kinds.md — a list with no due dates does not read them at
// all, rather than reading one and throwing it away. Discarding the due
// after the fact still strips the words that produced it, so the typed text
// disappears from the summary and is stored nowhere.
// *(added 2026-08-14, found in review.)*
describe('a list that does not take due dates', () => {
  it('leaves the date words in the summary', () => {
    const result = parseQuickAdd('Finish Dune next Friday', LISTS, NOW, {
      noDates: true,
    })
    expect(result.summary).toBe('Finish Dune next Friday')
    expect(result.due).toBeUndefined()
    expect(result.tokens.filter((t) => t.kind === 'date')).toEqual([])
  })

  it('still reads the tokens that do apply', () => {
    // Only dates are off. A list and a priority are still the grammar.
    const result = parseQuickAdd(
      'Finish Dune tomorrow #chores p1',
      LISTS,
      NOW,
      {
        noDates: true,
      },
    )
    expect(result.summary).toBe('Finish Dune tomorrow')
    expect(result.listId).toBe('c')
    expect(result.priority).toBe('high')
  })

  it('reads dates again once the option is off', () => {
    // What makes it reversible: the same text, parsed without the flag,
    // resolves the date — so retargeting the line at a list that takes
    // dates brings it back.
    const result = parseQuickAdd('Finish Dune tomorrow', LISTS, NOW)
    expect(result.summary).toBe('Finish Dune')
    expect(result.due?.date).toBe('2026-08-15')
  })
})

// A parser that invents a date while you are still typing an ordinary
// sentence is worse than one that misses a real date. These are the
// false positives found in use, not hypotheticals.
// *(added 2026-08-14, found in review.)*
describe('it does not invent a date out of ordinary words', () => {
  it.each([
    // The one that was reported: typing "sort out the shed" sets Today at
    // the current minute the moment "the s" is on screen. chrono's casual
    // parser reads <determiner> + a unit letter — s/m/h — as "now".
    'sort out the s',
    'sort out the m',
    'call a s',
    // "Now" itself, and the seconds-precision forms. A todo due this
    // instant is overdue the moment it exists, and a due date cannot
    // carry seconds at all (DueFields is a date plus HH:mm).
    'do it now',
    'ring mum in 5 seconds',
    'ring mum in 30 secs',
    // Fully typed, the same shape must stay inert.
    'sort out the shed',
    'buy a sandwich',
  ])('leaves %j alone', (input) => {
    const result = parse(input)
    expect(result.due).toBeUndefined()
    expect(result.summary).toBe(input)
    expect(result.tokens).toEqual([])
  })

  it('still reads the real relative forms', () => {
    // The guard must not cost the expressions people actually type.
    expect(parse('Ring mum in 2 hours').due?.time).toBe('11:00')
    expect(parse('Ring mum in 30 minutes').due?.time).toBe('09:30')
    expect(parse('Ring mum in 3 days').due?.date).toBe('2026-08-17')
  })
})

// Two bugs found in use, both of which produced a wrong todo rather than
// merely a wrong-looking one. *(added 2026-08-15.)*
describe('regressions', () => {
  it('reads a bare "today" as a date', () => {
    // The "now is not a due date" guard was too broad: `today` resolves to
    // the current instant, so it was discarded along with the phantom
    // matches it was written for. chrono tells them apart — `today` leaves
    // the hour *uncertain*, while "now" and the casual "the s" both assert
    // one — so only a match claiming an hour can be "now".
    const result = parse('Ring mum today')
    expect(result.due).toEqual({ date: '2026-08-14', time: '' })
    expect(result.summary).toBe('Ring mum')
  })

  it('still refuses the phantom matches that guard exists for', () => {
    for (const text of ['sort out the s', 'do it now', 'call a s']) {
      expect(parse(text).due).toBeUndefined()
      expect(parse(text).summary).toBe(text)
    }
  })

  it('matches a list name containing spaces, in full', () => {
    // `#Shopping list` resolved to the right list by prefix, but only
    // `#Shopping` was consumed — so "list" stayed behind and the todo was
    // created as "Buy milk list".
    const lists = [list('s', 'Shopping list'), list('c', 'Chores')]
    const text = 'Buy milk #Shopping list'
    const result = parseQuickAdd(text, lists, NOW)
    expect(result.listId).toBe('s')
    expect(result.summary).toBe('Buy milk')
    expect(result.tokens.map((t) => text.slice(t.start, t.end))).toEqual([
      '#Shopping list',
    ])
  })

  it('prefers the longer name when the text spells it out', () => {
    // "Chores" and "Chores (work)" both match `#Chores`, and the exact
    // match used to win unconditionally — leaving "(work)" behind in the
    // summary. A name the text writes out in full is the one meant.
    const text = 'Sweep #Chores (work)'
    const result = parse(text)
    expect(result.listId).toBe('cw')
    expect(result.summary).toBe('Sweep')
    expect(result.tokens.map((t) => text.slice(t.start, t.end))).toEqual([
      '#Chores (work)',
    ])
  })

  it('binds only the first list, and marks only that one', () => {
    // Both tokens were marked and stripped while only the first set the
    // list, so `#Chores #Work` filed into Chores with `#Work` highlighted
    // as though it had counted — and the word vanished from the summary
    // either way. A todo has one list; the later token is ordinary text.
    // *(fixed 2026-08-15, found in use.)*
    const text = 'Buy milk #Chores #Work'
    const result = parse(text)
    expect(result.listId).toBe('c')
    expect(result.summary).toBe('Buy milk #Work')
    expect(result.tokens.map((t) => text.slice(t.start, t.end))).toEqual([
      '#Chores',
    ])
  })

  it('binds only the first priority, for the same reason', () => {
    const text = 'Buy milk p1 p3'
    const result = parse(text)
    expect(result.priority).toBe('high')
    expect(result.summary).toBe('Buy milk p3')
    expect(result.tokens.map((t) => text.slice(t.start, t.end))).toEqual(['p1'])
  })

  it('consumes only what was typed when the name is a prefix', () => {
    // `#Shop` resolves to "Shopping list", but eight characters the user
    // never typed must not be swallowed out of the summary.
    const lists = [list('s', 'Shopping list')]
    const result = parseQuickAdd('Buy milk #Shop', lists, NOW)
    expect(result.listId).toBe('s')
    expect(result.summary).toBe('Buy milk')
  })
})
