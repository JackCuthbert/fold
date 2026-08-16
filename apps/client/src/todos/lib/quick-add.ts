import type { TodoList, TodoPriority } from '@fold/schemas'
import * as chrono from 'chrono-node'
import type { DueFields } from './due-fields'

// docs/specs/quick-add.md — one line of text becomes a todo.
//
// Pure, and deliberately so: text and a reference instant in, a
// description of what was found out. It decides nothing — an empty summary
// is *reported* rather than refused here, because the modal is what knows
// whether the user has finished typing. That keeps every rule in this file
// testable against a fixed `now` with no React and no clock.

/** Where a recognised token sat, so the input can dim it. */
export interface QuickAddToken {
  kind: 'date' | 'list' | 'priority'
  /** Index into the original text, `slice`-compatible. */
  start: number
  end: number
}

export interface QuickAddResult {
  /** What is left once every token is removed, whitespace collapsed. */
  summary: string
  /**
   * The date/time pair, in the shape the add and edit forms already use
   * (due-fields.ts). Deliberately *not* a `TodoDue`: `fieldsToDue` is the
   * one place that decides between an all-day `date` and a `zoned` value,
   * and a second construction path here would be the drift that helper
   * exists to prevent. `time: ''` means all-day.
   */
  due?: DueFields
  listId?: string
  /** Absent for no priority. */
  priority?: TodoPriority
  tokens: QuickAddToken[]
}

/**
 * `p1`–`p3`, the Todoist vocabulary (docs/specs/quick-add.md — priority).
 *
 * **`p4` is deliberately not here.** Todoist uses it for "no priority",
 * and it was briefly honoured — consumed from the summary, setting
 * nothing. That made it the one token whose mark in the input was not
 * matched by any change in the pills: the Priority pill sat exactly as it
 * had before, because no priority *is* the default. Highlighting text to
 * report that nothing happened is worse than not recognising it, so `p4`
 * is now ordinary words and stays in the summary.
 * *(changed 2026-08-14, found in review.)*
 */
const PRIORITY_BY_TOKEN: Record<string, TodoPriority> = {
  p1: 'high',
  p2: 'medium',
  p3: 'low',
}

// Standalone tokens only, hence the boundaries: `p1000` in "Order p1000
// connectors" is a part number, not a priority, and `#12` in "Fix issue
// #12" is not a list. Anchoring on whitespace (or the ends of the string)
// is what tells a token from a word that starts like one.
const PRIORITY_PATTERN = /(?:^|\s)(p[1-3])(?=\s|$)/gi
const LIST_PATTERN = /(?:^|\s)#([\p{L}\p{N}_-]+)(?=\s|$)/giu

/**
 * Find the list a `#token` names.
 *
 * `rest` is the text from the `#` onwards, because a list name may contain
 * spaces and the token pattern cannot: `#Shopping list` arrives here as
 * `Shopping`, and only the surrounding text can say whether the name
 * continues. A name the text **spells out in full** wins over anything
 * shorter, so `#Chores (work)` is that list rather than "Chores" with
 * "(work)" left stranded in the summary. Longest first, so the more
 * specific name wins when one contains the other.
 * *(added 2026-08-15.)*
 *
 * Otherwise **exact match wins over a prefix match**. With "Chores" and
 * "Chores (work)" both present, `#chores` is the former — typing the whole
 * of a name is an unambiguous statement, and picking the longer one because
 * it also matched would be the surprise. Ambiguity beyond that is resolved
 * by the autocomplete before submission (docs/specs/quick-add.md), so this
 * is the fallback for a token typed straight through.
 *
 * Case-insensitive: list names are prose, and `#chores` should find
 * "Chores".
 */
function findList(
  token: string,
  lists: readonly TodoList[],
  rest = '',
): TodoList | undefined {
  const needle = token.toLowerCase()
  const ahead = rest.toLowerCase()
  const spelledOut = lists
    .filter((list) => ahead.startsWith(list.displayName.toLowerCase()))
    .toSorted((a, b) => b.displayName.length - a.displayName.length)[0]
  if (spelledOut) return spelledOut
  const exact = lists.find((list) => list.displayName.toLowerCase() === needle)
  if (exact) return exact
  return lists.find((list) => list.displayName.toLowerCase().startsWith(needle))
}

/**
 * How many characters of `text` at `from` the list's own name occupies.
 *
 * The `#token` regex stops at whitespace, so a name containing one — "Shopping
 * list", "Chores (work)" — is only partly matched. The rest is still sitting
 * in the text immediately after it, and belongs to the token rather than to
 * the summary.
 *
 * Falls back to the matched length when the text does not actually continue
 * with the name: `#Shop` resolves to "Shopping list" by prefix, but only the
 * five characters typed are the user's, and swallowing eight more would eat
 * text they wrote. Only a name the text *spells out* is consumed in full.
 * *(added 2026-08-15.)*
 */
function nameLengthAt(text: string, from: number, name: string): number {
  const ahead = text.slice(from, from + name.length)
  if (ahead.toLowerCase() === name.toLowerCase()) return name.length
  // The typed run, up to the next space — what the pattern matched.
  const space = text.indexOf(' ', from)
  return (space === -1 ? text.length : space) - from
}

/**
 * Whether a match means *now* — this instant, rather than today.
 *
 * A due date is stored to the minute (`DueFields` — a date plus `HH:mm`),
 * so anything inside the current minute is the same due date as "this
 * instant". Seconds are deliberately not honoured: a todo cannot be due at
 * 22:41:30, so a match differing from now only in its seconds is a false
 * positive rather than a finer-grained answer.
 *
 * **The hour must be asserted, not inferred**, and that is the whole
 * distinction. A bare `today` resolves to the current instant too, because
 * chrono has to put the day *somewhere* on the clock — but it reports the
 * hour as uncertain, meaning nobody asked for one. "now" and the casual
 * "the s" both claim an hour outright. Testing the instant alone threw
 * `today` away with them, which is how a working date word stopped
 * working. *(fixed 2026-08-15; the guard was added 2026-08-14.)*
 */
const toMinute = (at: Date): number => new Date(at).setSeconds(0, 0).valueOf()

function isNow(start: chrono.ParsedComponents, now: Date): boolean {
  if (!start.isCertain('hour')) return false
  return toMinute(start.date()) === toMinute(now)
}

/**
 * Text chrono matched that no one would call a date.
 *
 * chrono's casual parser treats a determiner followed by a bare unit
 * letter — "the s", "a s", "the m", "the h" — as a relative expression, so
 * typing "sort out the shed" or "call a supplier" grew a due date mid-word
 * and took those words out of the summary. Most resolve to *now* and are
 * caught by `isNow`; "the m" lands a minute ahead and is not.
 *
 * The rule is about what was written rather than what it resolved to: a
 * unit has to be *named* to count. "in 2 hours" and "in 30 minutes" are
 * untouched — they have a number and a whole word — while a lone letter
 * hanging off a determiner is a half-typed English sentence.
 * *(added 2026-08-14, found in review.)*
 */
const HALF_TYPED_UNIT = /^(?:the|a|an)\s+[smhdwy]$/i

function isPhantomDate(matched: string): boolean {
  return HALF_TYPED_UNIT.test(matched.trim())
}

export interface QuickAddOptions {
  /**
   * Do not read dates at all — for a list whose kind has no due dates
   * (docs/specs/list-kinds.md).
   *
   * Off rather than parsed-then-discarded. Dropping the due *after* a
   * parse still strips the words that produced it from the summary, so
   * "Finish Dune next Friday" filed into Reading became "Finish Dune" and
   * the date went nowhere — text deleted from the title with no record of
   * it anywhere. With matching off, nothing is recognised, so nothing is
   * removed and the line stands exactly as typed.
   *
   * Naming a list that *does* take dates re-enables it, because the parse
   * is derived from the text on every render rather than held in state —
   * so adding `#chores` to that same line brings the date back.
   * *(added 2026-08-14, found in review.)*
   */
  noDates?: boolean
}

/**
 * Parse one line into the parts of a todo.
 *
 * `now` is passed rather than read so every test pins a reference date and
 * no test depends on the day it runs (docs/specs/testing.md).
 */
export function parseQuickAdd(
  text: string,
  lists: readonly TodoList[],
  now: Date,
  options: QuickAddOptions = {},
): QuickAddResult {
  const tokens: QuickAddToken[] = []
  let priority: TodoPriority | undefined
  let listId: string | undefined

  // Lists and priorities first, so their text is out of the way before
  // chrono reads the rest. Left in, `#chores` and `p1` are noise a date
  // parser has to step over — and `p2` in particular can read as a time.
  for (const match of text.matchAll(LIST_PATTERN)) {
    const raw = match[1]
    if (raw === undefined) continue
    // The text after the `#`, so a name containing spaces can be seen in
    // full — see `findList`.
    const afterHash = text.slice(text.indexOf(`#${raw}`, match.index) + 1)
    const found = findList(raw, lists, afterHash)
    // An unmatched `#` is ordinary text and stays in the summary, so
    // "Fix issue #12" survives intact.
    if (!found) continue
    // **One list per todo, so only the first token binds — and only the
    // token that binds is marked.** Both used to be marked and stripped
    // while only the first set the list, so `#Chores #Work` filed into
    // Chores with `#Work` highlighted as though it counted, and the word
    // disappeared from the summary regardless. A second list is not a
    // thing a todo can have, so the later token is ordinary text.
    // *(fixed 2026-08-15, found in use.)*
    if (listId !== undefined) continue
    listId = found.id
    // `match.index` is the whitespace before the token when there was
    // any; the token itself starts at the `#`.
    const start = text.indexOf(`#${raw}`, match.index)
    // How much of the *text* this name occupies, which is not the same as
    // the regex match when the name contains spaces. `#Shopping list`
    // matched only `#Shopping` — the pattern stops at whitespace — and
    // `findList` then resolved it by prefix, so the list was right while
    // the word "list" stayed behind in the summary: "Buy milk list".
    // Measuring against the resolved name instead consumes all of it.
    // *(fixed 2026-08-15.)*
    tokens.push({
      kind: 'list',
      start,
      end: start + 1 + nameLengthAt(text, start + 1, found.displayName),
    })
  }

  for (const match of text.matchAll(PRIORITY_PATTERN)) {
    const raw = match[1]
    if (raw === undefined) continue
    const token = raw.toLowerCase()
    if (!(token in PRIORITY_BY_TOKEN)) continue
    // First one binds, and only it is marked — same rule as the list
    // above, for the same reason: a todo has one priority.
    if (priority !== undefined) continue
    priority = PRIORITY_BY_TOKEN[token]
    const start = text.indexOf(raw, match.index)
    tokens.push({ kind: 'priority', start, end: start + raw.length })
  }

  // Chrono reads the text **in the gaps between the tokens above**, one
  // segment at a time, rather than reading the whole string with those
  // tokens blanked out.
  //
  // Blanking was the first approach and produced a real bug: spaces keep
  // the indices aligned, but they do not stop chrono reading *across* the
  // gap. "Do the thing next week #chores 3pm" came back as a single match
  // spanning "next week          3pm" — a range that swallowed the list
  // token sitting inside it. Two things then broke: the input's dimming
  // layer walks the tokens in order and slices between them, so a range
  // overlapping the previous one made the slice run backwards and repeat
  // text ("…#Chores3pm#Chores 3pm" on screen); and the reported range
  // claimed characters the date had not actually been read from.
  //
  // Segmenting removes the class of bug rather than patching the symptom:
  // a match can no longer span a token because chrono is never shown one.
  // *(fixed 2026-08-14, found in review.)*
  // A day and a time can land in *different* segments — "next week
  // #chores 3pm" puts "next week" before the list token and "3pm" after
  // it — and together they are one due, not two. So the day is taken from
  // the first match that carries one and the time from the first that
  // carries one, rather than stopping at the first match of either kind.
  let day: Date | undefined
  let clock: Date | undefined
  // Skipped entirely when the target list takes no dates, so no date token
  // is reported and no date text is stripped from the summary
  // (see `QuickAddOptions.noDates`).
  for (const segment of options.noDates ? [] : gapsBetween(text, tokens)) {
    const [parsed] = chrono.parse(segment.text, now, { forwardDate: true })
    if (!parsed) continue
    const start = parsed.start
    // **"Now" is not a due date.** A todo scheduled for this instant is
    // overdue as soon as it exists, which nobody means, so a match that
    // resolves to the reference instant is discarded rather than written.
    //
    // This also removes a whole family of false positives rather than
    // listing them. chrono's casual parser reads a determiner followed by
    // a unit letter — "the s", "a s", "the m" — as *now*, so typing "sort
    // out the shed" invented a due date of today at the current minute the
    // moment "the s" was on screen, then took those words out of the
    // summary. Every one of those resolves to the reference instant, so
    // one rule about meaning catches them all; matching the phrases would
    // have been a list that the next casual pattern escapes.
    // *(added 2026-08-14, found in review.)*
    if (isNow(start, now)) continue
    // The same family, for the few that land a minute out rather than on
    // the instant — see `isPhantomDate`.
    if (isPhantomDate(parsed.text)) continue
    // `isCertain('hour')` is the all-day/timed distinction
    // (docs/specs/todos.md — due times): a date chrono inferred rather
    // than read is not a time the user asked for.
    if (start.isCertain('hour')) clock ??= start.date()
    // A bare time ("3pm") also resolves to a day — today's — which must
    // not outrank an explicit one stated elsewhere in the line. Only a
    // match that actually names a day sets it.
    if (
      start.isCertain('day') ||
      start.isCertain('weekday') ||
      start.isCertain('month')
    ) {
      day ??= start.date()
    }
    // Offset back into the original string, since chrono indexed the
    // segment rather than the whole line.
    tokens.push({
      kind: 'date',
      start: segment.offset + parsed.index,
      end: segment.offset + parsed.index + parsed.text.length,
    })
  }

  // A time with no day means today — chrono's own reading, and the one a
  // person means by "3pm".
  const dayPart = day ?? clock
  const due: DueFields | undefined = dayPart
    ? { date: localDate(dayPart), time: clock ? localTime(clock) : '' }
    : undefined

  return {
    summary: stripTokens(text, tokens),
    ...(due ? { due } : {}),
    ...(listId ? { listId } : {}),
    ...(priority ? { priority } : {}),
    tokens: tokens.toSorted((a, b) => a.start - b.start),
  }
}

/**
 * Rewrite one token's text in place, or append the replacement when the
 * token is not there yet.
 *
 * This is what makes the preview pills editable without becoming a second
 * source of truth (docs/specs/quick-add.md): choosing a different list from
 * the `#chores` pill edits the *text* to say `#work`, and the parse then
 * follows from the text exactly as it would have if you had typed it. The
 * alternative — holding the chosen list in state beside the text — is the
 * two-sources-of-truth design the spec rejects.
 *
 * `replacement` is inserted verbatim, so the caller decides the token's
 * spelling (`#Work`, `p2`, `tomorrow at 3pm`). An empty replacement removes
 * the token, which is how a pill is cleared.
 *
 * *(added 2026-08-14: pills became clickable after the first cut shipped
 * read-only ones.)*
 */
export function replaceToken(
  text: string,
  token: QuickAddToken | undefined,
  replacement: string,
): string {
  if (!token) {
    // Nothing to replace: append, with a separating space unless the line
    // is empty or already ends in one.
    if (replacement === '') return text
    const needsSpace = text !== '' && !text.endsWith(' ')
    return `${text}${needsSpace ? ' ' : ''}${replacement}`
  }
  const before = text.slice(0, token.start)
  const after = text.slice(token.end)
  // Collapse the join so removing a token does not leave a double space,
  // and trim only the seam rather than the whole line — a trailing space
  // the user typed is theirs to keep while they are still typing.
  return `${before}${replacement}${after}`.replace(/ {2,}/g, ' ')
}

/** A stretch of text between tokens, with its offset in the original. */
interface Gap {
  text: string
  offset: number
}

/**
 * The runs of text *not* covered by any token.
 *
 * This is what chrono is given, one at a time, so a date match can never
 * span a `#list` or a `p1` sitting between two halves of a phrase — see
 * the note at the call site.
 *
 * Sliced rather than built from spread characters: `[...text]` splits on
 * Unicode *code points*, so an emoji would come apart and every offset
 * after it would shift. `slice` works in the same UTF-16 units the token
 * offsets are measured in.
 */
function gapsBetween(text: string, tokens: readonly QuickAddToken[]): Gap[] {
  if (tokens.length === 0) return [{ text, offset: 0 }]
  // Sorted so the walk moves strictly forwards whatever order the tokens
  // were found in.
  const ordered = tokens.toSorted((a, b) => a.start - b.start)
  const gaps: Gap[] = []
  let cursor = 0
  for (const token of ordered) {
    if (token.start > cursor) {
      gaps.push({ text: text.slice(cursor, token.start), offset: cursor })
    }
    cursor = Math.max(cursor, token.end)
  }
  if (cursor < text.length) {
    gaps.push({ text: text.slice(cursor), offset: cursor })
  }
  return gaps
}

/**
 * The text with every token removed and the whitespace tidied.
 *
 * Collapsing matters: removing a token from the middle leaves two spaces
 * where there was one, and "Ring   mum" is the tell-tale of a naive strip.
 */
function stripTokens(text: string, tokens: readonly QuickAddToken[]): string {
  // The gaps *are* the summary — the same decomposition the date parse
  // uses, joined with a space so two adjacent gaps do not run their words
  // together, then collapsed.
  return gapsBetween(text, tokens)
    .map((gap) => gap.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const pad = (value: number): string => String(value).padStart(2, '0')

// Local, not `toISOString` — the same trap `localDayOf` avoids elsewhere:
// a 9pm todo would otherwise land on tomorrow's date.
const localDate = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

const localTime = (date: Date): string =>
  `${pad(date.getHours())}:${pad(date.getMinutes())}`
