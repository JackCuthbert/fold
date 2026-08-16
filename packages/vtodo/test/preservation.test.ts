import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ICAL from 'ical.js'
import { describe, expect, it } from 'vitest'
import { applyChanges } from '../src/update'

const NOW = new Date('2026-07-30T10:00:00Z')
const fixture = (name: string): string =>
  readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8')

describe('round-trip preservation', () => {
  it('preserves alarms, x-props, rrule, related-to and categories', () => {
    const out = applyChanges(
      fixture('foreign.ics'),
      { summary: 'Water garden thoroughly' },
      NOW,
    )
    expect(out).toContain('BEGIN:VALARM')
    expect(out).toContain('TRIGGER:-PT15M')
    expect(out).toContain('X-FANCY-PROP;X-PARAM=yes:keep-me')
    expect(out).toContain('RRULE:FREQ=WEEKLY;BYDAY=SA')
    expect(out).toContain('RELATED-TO:parent-uid-1')
    expect(out).toContain('CATEGORIES:home,garden')
    expect(out).toContain('X-WR-CALNAME:Chores')
  })

  it.each([
    ['DUE:20260810T090000', 'floating'],
    ['DUE;TZID=Australia/Brisbane:20260810T090000', 'zoned'],
    ['DUE;TZID=Nowhere/Unknown:20260810T090000', 'unresolvable zone'],
  ])('preserves a foreign %s (%s) when editing another field', (dueLine) => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Another Client//EN',
      'BEGIN:VTODO',
      'UID:tz-1',
      'DTSTAMP:20260701T120000Z',
      'SUMMARY:Original',
      dueLine,
      'END:VTODO',
      'END:VCALENDAR',
    ].join('\r\n')
    const out = applyChanges(ics, { summary: 'Edited' }, NOW)
    // The DUE line must survive byte-equivalent — no zone conversion,
    // no Z suffix appearing, no host-offset shift.
    expect(out).toContain(dueLine)
  })

  it('only touches the first VTODO in a multi-todo resource', () => {
    const out = applyChanges(fixture('multi.ics'), { summary: 'Edited' }, NOW)
    const root = new ICAL.Component(ICAL.parse(out))
    const [main, sibling] = root.getAllSubcomponents('vtodo')
    expect(main?.getFirstPropertyValue('summary')).toBe('Edited')
    expect(sibling?.getFirstPropertyValue('summary')).toBe('Sibling todo')
    expect(sibling?.getFirstPropertyValue('x-sibling-prop')).toBe('untouched')
    expect(sibling?.getFirstProperty('last-modified')).toBeNull()
  })
})
