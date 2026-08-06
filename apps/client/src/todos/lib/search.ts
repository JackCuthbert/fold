import type { Todo } from '@fold/schemas'
import Fuse, { type IFuseOptions } from 'fuse.js'

// docs/specs/search-view.md — fuzzy text search across every todo, from
// every list.

/**
 * The shortest query worth running.
 *
 * One character matches most of a corpus fuzzily, so a single keystroke
 * would render a "results" list that is really just everything in a
 * different order — noise that looks like an answer. Two is where a query
 * starts to mean something.
 */
export const MIN_QUERY_LENGTH = 2

/**
 * How Fuse is configured, and why each part of it.
 *
 * `threshold` (0 = exact, 1 = match anything) at 0.4 is Fuse's own default
 * and the value that behaved best against real data here: 0.6 matched
 * "milk" against "Book flights", which reads as broken rather than
 * forgiving, and 0.2 stopped forgiving the typos that are the whole reason
 * to be fuzzy at all.
 *
 * `ignoreLocation` matters more than the threshold. Without it Fuse scores
 * by *where* in the string a match lands, which is reasonable for names but
 * wrong for a description: a word in the third paragraph of a note is not a
 * worse match than the same word in the first, and leaving it off made long
 * descriptions effectively unsearchable past their opening line.
 *
 * `minMatchCharLength` stops a two-character query from matching on a
 * single shared letter.
 */
// Typed as Fuse's own options rather than inferred: `keys` is declared
// mutable there, so an `as const` object is rejected outright. Annotating
// is what keeps this honest — the alternative was an assertion, which
// would have silenced a real mismatch as readily as this one
// (CLAUDE.md — fix findings, don't suppress them).
const OPTIONS: IFuseOptions<Todo> = {
  // Summary is weighted well above description: someone searching "milk"
  // wants the todo *called* milk, not the one whose notes mention it in
  // passing. Both are searched, though — the issue asks for descriptions,
  // and a note is often where the detail you half-remember actually lives.
  keys: [
    { name: 'summary', weight: 0.8 },
    { name: 'description', weight: 0.2 },
  ],
  threshold: 0.4,
  ignoreLocation: true,
  minMatchCharLength: 2,
  // Fuse sorts by score by default; being explicit keeps the ordering a
  // stated decision rather than a default that could change under us.
  shouldSort: true,
}

/**
 * Todos matching `query`, best match first, across every list given.
 *
 * **Everything is searched.** No list kind is treated specially, nothing is
 * narrowed by due date or status, and completed todos are included —
 * search is how you find the thing you can't otherwise find, and the todo
 * you are hunting is disproportionately likely to be one you finished and
 * half-forgot. A search that quietly excluded a category would be worse
 * than useless: it would answer "no results" for something that is right
 * there. So this takes the todos it is given and applies exactly one rule
 * to them, the text.
 *
 * The **hidden-list filter is the one exception**, and it is not one this
 * function makes: the caller passes only the lists the filter leaves
 * showing, the same way every other derived view receives them
 * (docs/specs/list-filter.md — the nav rows and the derived views,
 * together). That has to hold here more than anywhere. The filter exists so
 * a personal list is not on screen during a screenshare, and a search box
 * that would surface "Therapy — book appointment" for a stray query would
 * defeat it completely, from the one surface most likely to be typed into
 * in front of an audience. Hiding a list is a deliberate act with an
 * explicit confirm behind undoing it; it outranks this view's reach.
 *
 * Below `MIN_QUERY_LENGTH` this returns nothing rather than everything.
 * That is deliberate — an empty query is "you haven't asked yet", which is
 * a different state from "nothing matched", and the pane says so.
 *
 * A new Fuse index per call, which is the deliberate part. Measured on this
 * machine, index plus search: 2.6ms at 200 todos, 11.5ms at 1,000, 23.5ms
 * at 2,000, 60ms at 5,000.
 *
 * So this is *not* free at scale — past roughly a thousand todos it exceeds
 * a 16ms frame and a fast typist would feel it. It is still the right shape
 * for now, on two grounds: a personal todo app's corpus is the low hundreds
 * (2.6ms, imperceptible), and the alternative is a cached index that must
 * be invalidated on every cache write — completing a todo from any view,
 * every background poll, every sync — which trades a correctness problem
 * for an optimisation nobody is currently asking for.
 *
 * If that changes, the fix is a `useMemo` keyed on the todos array
 * identity rather than a hand-rolled cache: the fan-out already gives a new
 * array only when something actually changed. Left undone on purpose —
 * the numbers above say when to do it.
 */
export function searchTodos(todos: readonly Todo[], query: string): Todo[] {
  const trimmed = query.trim()
  if (trimmed.length < MIN_QUERY_LENGTH) return []
  const fuse = new Fuse([...todos], OPTIONS)
  return fuse.search(trimmed).map((result) => result.item)
}

/** Whether a query is long enough to have been run at all. */
export const isSearchable = (query: string): boolean =>
  query.trim().length >= MIN_QUERY_LENGTH
