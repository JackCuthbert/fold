/**
 * List colours — docs/specs/lists.md (colours).
 *
 * Apple's `calendar-color` (the `http://apple.com/ns/ical/` namespace) is
 * written as 8 hex digits with an alpha suffix — `#1D9BF6FF`. Fold stores
 * and renders 6.
 *
 * Parsing is deliberately forgiving on input and strict on output: a value
 * we cannot read is treated as **absent** rather than raised, because a
 * foreign client writing something unexpected must not break list
 * discovery (docs/specs/caldav-compliance.md — degrade, don't fail).
 */

const HEX_6 = /^#[0-9A-F]{6}$/
const HEX_8 = /^#[0-9A-F]{8}$/
const HEX_3 = /^#[0-9A-F]{3}$/

/**
 * A server value → our stored `#RRGGBB`, or `null` when it is missing or
 * unreadable. Accepts `unknown` because it is called directly on values
 * parsed out of XML, which are untyped by nature.
 */
export function parseListColor(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim().toUpperCase()
  if (HEX_8.test(value)) return value.slice(0, 7)
  if (HEX_6.test(value)) return value
  if (HEX_3.test(value)) {
    // #ABC → #AABBCC. Rare from a server, but valid CSS, and a user could
    // type it into the hex field.
    const r = value.slice(1, 2)
    const g = value.slice(2, 3)
    const b = value.slice(3, 4)
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return null
}

/**
 * Our stored `#RRGGBB` → the 8-digit form other clients expect to find.
 * Always fully opaque: Fold has no notion of a translucent list.
 */
export function formatListColor(color: string): string {
  return `${color.toUpperCase()}FF`
}
