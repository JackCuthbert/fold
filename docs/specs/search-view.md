# The Search view

*(added 2026-08-06, issue #6.)*

A derived view for finding a todo by what it says, across every list, when
you cannot remember which list you put it in.

Like [Today](./today-view.md), [Tomorrow](./tomorrow-view.md) and
[Summary](./summary-view.md) it is a **view, not a collection**: nothing is
created on the server, no CalDAV request is made on its behalf, and every
todo continues to belong to the list it was created in
([lists](./lists.md)).

## Where it sits

Last of the derived views, after Summary, taking `Ctrl+Shift+4`.

Appending rather than inserting is deliberate: it leaves all three existing
chords exactly where they are. Tomorrow was inserted at position 2 and cost
Summary its digit, which was worth it once — the three day views read in a
natural order and getting that wrong would look wrong every day. Search has
no such claim on a position among them. It is a different kind of thing:
those slice by time, this one by text. Last is also where it belongs by
use, since the day views are what you open by habit and this is what you
reach for when they have not got what you want.

## What it searches

**Everything, with one exception.**

- **Both the summary and the description.** The detail you half-remember is
  often in the note rather than the title. Summary is weighted well above
  description (0.8 against 0.2) — someone searching "milk" wants the todo
  *called* milk, not the one whose notes mention it in passing.
- **Completed todos too.** The todo you are hunting for is
  disproportionately likely to be one you finished and half-forgot. A
  search that hid them would answer "no results" for something that is
  right there.
- **No list kind is treated specially.** [List kinds](./list-kinds.md)
  change how todos are *displayed* — health leads Today, groceries group.
  None of that applies here. A kind is not a category of relevance.
- **Nothing is narrowed by due date or status.** The only rule applied to
  the corpus is the text.

**The exception is [the hidden-list filter](./list-filter.md)**, which
still applies, exactly as it does to every other derived view. This matters
more here than anywhere: the filter exists so a personal list is not on
screen during a screenshare, and a search box that surfaced "Therapy — book
appointment" for a stray query would defeat it completely, from the one
surface most likely to be typed into in front of an audience. Hiding a list
is a deliberate act with an explicit confirmation behind undoing it; it
outranks this view's reach.

## Fuzzy, not exact

Search is fuzzy so a half-remembered or mistyped query still finds its
todo — "dentst" finds "Dentist appointment". Exact matching would require
you to spell the thing you cannot quite remember.

[Fuse.js](https://www.fusejs.io/) does the matching, rather than a
hand-rolled subsequence match: the issue's open question asked for a widely
supported library, and ranking across two weighted fields is exactly the
part a home-grown scorer gets subtly wrong.

Configured with `threshold: 0.4` (Fuse's own default — 0.6 matched "milk"
against "Book flights", which reads as broken rather than forgiving) and
`ignoreLocation: true`, which matters more: without it Fuse scores by
*where* in the string a match lands, and a word in the third paragraph of a
note would rank below the same word in the first, making long descriptions
effectively unsearchable past their opening line.

## Three states, not two

The view distinguishes **"you have not asked yet"** from **"nothing
matched"**. They are different answers and the first is not an empty state.

- Below two characters, nothing is searched and nothing is shown but a
  prompt. One character matches most of a corpus fuzzily, so the result
  would be the whole list in a strange order — noise dressed as an answer.
- With a query and no matches, the view names what it searched for, so the
  typo is visible.
- The count line under the title stays **blank** in both cases. Not a
  loading skeleton, which would claim a fetch is in flight when nothing is
  loading, and not "No todos", which is both vaguer than the pane's own
  message and untrue — there are todos, just none of them this.
  *(fixed 2026-08-06: it drew the skeleton until the first search.)*

This is the one derived view carrying empty-state copy, against the call
made for Today, Tomorrow and Summary. Those have a title and a count line
that already say it; here the count line is deliberately silent, and
"nothing matched *xyz*" is information a title cannot carry.

## Ordering and grouping

**Best match first**, which is Fuse's score order.

**No grouping**, unlike Today and Summary. Grouping collapses a list's
todos into one row, which is right when scanning a day — eight things to
buy is one errand — and wrong when searching: you asked for a specific todo
by name, and hiding it inside a "Groceries (8)" row would answer a question
you did not ask. Every match is its own row, and the count counts them.

## State

**Transient.** The query is not persisted and not in the URL.

A search is a question you are asking right now; reopening the app to
yesterday's half-remembered query, with results already on screen, would be
answering something nobody asked. It does survive the mobile/desktop
breakpoint, because it is held in `MainScreen` — the only component mounted
at every viewport — for the same reason the detail form is
([ui](./ui.md) — the detail panel).

## Fetching

Through `useTodayTodos`, the same fan-out the other derived views use, so
it costs no request of its own and the per-list ctag short-circuit keeps an
unchanged list to a cheap 304 ([caldav-compliance](./caldav-compliance.md)).

## Performance

The index is rebuilt on every search rather than cached. Measured (index
plus search): 2.6ms at 200 todos, 11.5ms at 1,000, 23.5ms at 2,000, 60ms at
5,000.

So this is not free at scale — past roughly a thousand todos it exceeds a
16ms frame. It is still the right shape: a personal todo app's corpus is
the low hundreds, where it is imperceptible, and the alternative is an
index that must be invalidated on every cache write (completing a todo from
any view, every background poll, every sync), trading a correctness problem
for an optimisation nobody is asking for. If that changes, the fix is a
`useMemo` keyed on the todos array identity — the fan-out already returns a
new array only when something actually changed.

## What it does not do

**No filter buttons for due, list or priority.** The original issue
proposed them; the answer is that the list filter already exists and is
better than a per-view control would be (it covers the nav too), and due
and priority are what Today and Tomorrow are *for*. Combining a text query
with filters is a command-palette feature (issue #26), not this view's.

**No `Cmd/Ctrl+F` binding.** It would reach the same place `Ctrl+Shift+4`
does, at the cost of the browser's own find — which answers a genuinely
different question ("where is that word on this screen")
([ui](./ui.md) — keyboard shortcuts).
