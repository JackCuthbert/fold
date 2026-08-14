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
  /** Absent for no priority — including an explicit `p4`. */
  priority?: TodoPriority
  tokens: QuickAddToken[]
}

/**
 * `p1`–`p4`, the Todoist vocabulary (docs/specs/quick-add.md — priority).
 *
 * `p4` maps to `undefined`: it is what a Todoist user types to mean "no
 * priority", so it is consumed rather than left in the summary, but it
 * sets nothing.
 */
const PRIORITY_BY_TOKEN: Record<string, TodoPriority | undefined> = {
  p1: 'high',
  p2: 'medium',
  p3: 'low',
  p4: undefined,
}

// Standalone tokens only, hence the boundaries: `p1000` in "Order p1000
// connectors" is a part number, not a priority, and `#12` in "Fix issue
// #12" is not a list. Anchoring on whitespace (or the ends of the string)
// is what tells a token from a word that starts like one.
const PRIORITY_PATTERN = /(?:^|\s)(p[1-4])(?=\s|$)/gi
const LIST_PATTERN = /(?:^|\s)#([\p{L}\p{N}_-]+)(?=\s|$)/giu

/**
 * Find the list a `#token` names.
 *
 * **Exact match wins over a prefix match.** With "Chores" and
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
): TodoList | undefined {
  const needle = token.toLowerCase()
  const exact = lists.find((list) => list.displayName.toLowerCase() === needle)
  if (exact) return exact
  return lists.find((list) => list.displayName.toLowerCase().startsWith(needle))
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
    const found = findList(raw, lists)
    // An unmatched `#` is ordinary text and stays in the summary, so
    // "Fix issue #12" survives intact.
    if (!found) continue
    listId ??= found.id
    // `match.index` is the whitespace before the token when there was
    // any; the token itself starts at the `#`.
    const start = text.indexOf(`#${raw}`, match.index)
    tokens.push({ kind: 'list', start, end: start + raw.length + 1 })
  }

  for (const match of text.matchAll(PRIORITY_PATTERN)) {
    const raw = match[1]
    if (raw === undefined) continue
    const token = raw.toLowerCase()
    if (!(token in PRIORITY_BY_TOKEN)) continue
    priority ??= PRIORITY_BY_TOKEN[token]
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
  for (const segment of gapsBetween(text, tokens)) {
    const [parsed] = chrono.parse(segment.text, now, { forwardDate: true })
    if (!parsed) continue
    const start = parsed.start
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
