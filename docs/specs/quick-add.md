# Quick add

*(added 2026-08-14.)*

One text field that creates a todo. You type
`Clean the gutters tomorrow at 3pm #chores p1`, press Enter, and get a todo
called "Clean the gutters", due tomorrow at 3pm, in Chores, at high
priority.

This replaced the add-todo modal's form — a summary field, a list picker,
and an Advanced accordion holding due date, time and notes — and then
replaced it entirely: the form was deleted on 2026-08-14 once quick add
covered every field it had. Quick add is the only way to create a todo.

## Why

**Creating a todo is the most frequent action in the app and was the
slowest.** The modal this replaced was a field, a dropdown, and a
disclosure hiding three more fields. A todo with a due date and a priority
cost a click to open the accordion, two date/time interactions and a
select — for information that takes two seconds to *say*.

The owner creates up to ten at a sitting. Ten todos through that form was
roughly sixty interactions, and the friction was per-todo rather than
amortised.

**The register stays calm** ([overview](./overview.md) — product intent).
This is not a power-user command palette bolted onto a quiet app; it is the
same act with fewer steps. Nothing here nags, and nothing here is a
shortcut you must learn: plain text with no tokens creates a plain todo,
which is what typing has always done.

## The grammar

Four token types, all optional, in any order, anywhere in the text.

| Token | Means | Examples |
|---|---|---|
| *(bare text)* | The summary | `Clean the gutters` |
| natural date | Due date, and time if given | `tomorrow`, `friday`, `next tuesday`, `in 3 days`, `25 Aug`, `3pm`, `tomorrow at 3pm` |
| `#name` | The list | `#chores`, `#work` |
| `p1`–`p3` | Priority | `p1` high, `p2` medium, `p3` low |

**What is left after removing every recognised token is the summary**, with
surrounding whitespace collapsed. `Clean the gutters tomorrow at 3pm #chores
p1` leaves `Clean the gutters`.

### Priority is `p1`–`p3`, matching Todoist

Not `!high` or `!!`. `pN` is the convention in the tool most people arrive
from, it is unambiguous against ordinary prose, and it is two keystrokes.

Fold has three priority levels plus none ([todos](./todos.md) — priority),
so the mapping is `p1`→high, `p2`→medium, `p3`→low.

**`p4` is deliberately not in the grammar**, though Todoist uses it for "no
priority". It was accepted at first, on the reasoning that leaving a
familiar token in the summary would be worse than honouring it. In use it
was worse honoured: `p4` sets nothing, because no priority is already the
default — so it was the one token whose highlight in the input was matched
by no change in the pills at all. A mark that reports "nothing happened"
is worse than no mark, so `p4` is ordinary text and stays in the summary.
*(changed 2026-08-14, found in use.)*

### `#` for lists, not `@`

`@` reads as a person in every other tool that uses it. Fold has no people,
so `@` would be a symbol with no meaning available for a symbol that has
one.

### Dates come from a library, not from us

**`chrono-node` (MIT, no dependencies).** Date parsing is a deep problem
with a long tail — `next tuesday` on a Tuesday, `25 Aug` when August has
passed, DST boundaries — and it is not a problem this app is trying to
solve. Hand-rolling it would produce a subset that is wrong in ways nobody
notices until a todo lands on the wrong day.

Measured before adopting *(2026-08-14)*:

- **12KB gzipped** into the client bundle (45KB minified). The 7.1MB the
  package occupies on disk is source maps and other locales, none of which
  ship. Against a current bundle of 222KB gzipped this is about 5% —
  the largest single cost in this feature, and the reason it was measured
  before being specified rather than after.
- Parses everything in the table above correctly against a fixed reference
  date, including `in 3 days` and `next week`.
- **Declines to guess**, which matters more than coverage: `Buy milk`,
  `Read chapter 3` and `Update the v2 spec` all parse to no date. A parser
  that turned "chapter 3" into the 3rd would be worse than no parser.
- Distinguishes a **date** from a **date and time** via
  `result.start.isCertain('hour')`, which is exactly the distinction
  [todos](./todos.md#due-times) already draws between an all-day `date` due
  and a timed one. `tomorrow` is all-day; `tomorrow at 3pm` is timed.

`forwardDate: true`, so a bare weekday means the coming one. Note that a
weekday naming *today* resolves to today rather than a week out — "friday"
said on a Friday means today, which is the conventional reading. `next
friday` gives the following week.

**Dates are parsed against one `now` per keystroke**, the same
single-instant discipline the derived views use, so a parse cannot
straddle midnight mid-render.

## Ambiguity is resolved by choosing, not by guessing

**Typing `#` opens an inline autocomplete** of the lists, filtered as you
type. `Ctrl+N` / `Ctrl+P` move down and up; `Enter` or `Tab` accepts;
`Esc` closes the menu without closing the modal.

This is the answer to "what if two lists match `#ch`". There is no
resolution step, no best-guess, and no warning state to design — the token
is only ever completed by picking a real list, so an ambiguous token cannot
reach submission.

*Rejected: parse `#chores` as free text and match it later.* It needs a
tie-break rule, a way to show that a guess was made, and a way to correct
it — three pieces of UI to handle a case the autocomplete removes.

**Ctrl+N/P rather than arrow keys alone.** Arrows also work, but the
control pair keeps the hands on the home row through an interaction whose
entire point is speed, and matches the readline convention the owner
already uses. Both are live; neither is required.

Matching is fuzzy, via `fuse.js` — already a dependency, used by
[search](./search-view.md), so the list picker and search rank names the
same way.

**It floats over the modal and is sized by its contents**, wearing the same
popup and row styles as the list pill's own menu — so the two ways of
choosing a list are one control with one look. As a block in the flow it
pushed the notes row and the pills down while a token was being typed and
pulled them back when it resolved, moving the controls under the pointer
mid-choice. *(changed 2026-08-14.)*

**Accepting adds a trailing space**, and puts the caret after it. Without
one the line ends in a `#token`, which is what opens this menu — so
choosing a list immediately reopened the picker over the choice just made.
The same applies to the list pill, which writes the token the same way.

## What the modal looks like

A launcher, in the Alfred/Raycast sense: **one prominent field, a row of
pills under it showing what the parse produced, and a footer.**

```
┌──────────────────────────────────────────────┐
│  Clean the front gutters and downpipes       │
│  before the rain tomorrow at 3pm #chores p1  │
│  + Notes                                     │
│  [● Chores ▾] [Tomorrow ▾] [3:00pm ▾] [High ▾]│
│  ⓘ Keyboard          [ Cancel ] [ Add todo ]│
└──────────────────────────────────────────────┘
```

The field wraps and grows downward; everything below it moves down with
it.

**The footer carries the only two visible ways out.** There is no header,
and so no ✕ — a title bar would make this a form again — which left
Escape and clicking the scrim as the only exits. Neither is visible, and
Escape is unreachable on a phone, so **Cancel** sits beside **Add todo**
as the quiet half of the pair (the same secondary treatment the confirm
dialog uses). Enter still submits; the button is the same action reachable
by a finger. It is deliberately not disabled when the line is incomplete —
a dead button explains nothing, while pressing it produces the message
that says what is missing. *(added 2026-08-14, on review.)*

On touch the Keyboard trigger beside them is **gone entirely**: every
binding it documents — Enter, Shift+Enter, Esc — needs hardware keys, so
on a phone it explained controls that do not exist while crowding the two
that do. The footer also wraps rather than crushing them together.
*(added 2026-08-14.)*

**Ordered list, date, time, priority** — widest scope first. Where a todo
lives outranks when it is due, which outranks the hour within that day,
which outranks how much it matters; and the time pill sits beside the date
it depends on. It is also the order of how often each is answered, so the
eye meets the common decisions first. *(ordered 2026-08-14.)*

The pills are set in the annotation face (`--meta`), not the reader's
chosen body serif — the same face the row's own meta pills use, so the
preview of a todo and the todo it becomes are set alike.

**Recognised tokens are marked in the input** rather than removed as you
type. Removing them would fight the cursor; marking shows what has been
understood without moving anything.

They are *marked text*, not chips: a tinted `--accent` background at the
same 12% the preview pills use, padded by 2px and 5px and rounded to
`--radius-sm`. *(changed 2026-08-14: they were dimmed to `--faint`, which
read as "this part didn't count" when the opposite is true — a mark is the
parser saying it understood.)*

**The mark is padded because the field is a contenteditable.** It was
square and unpadded for as long as the field was an `<input>` with a
shadow layer beneath it, because that arrangement cannot pad a token
without moving the layer it lives in — the drift was measured at 34px
across three tokens then, and 52px when re-measured against a wrapping
`<textarea>` in 2026-08-19. That is a property of the shadow layer rather
than of the `<input>`, so it survived every variation of the two-layer
approach and only went away when the second layer did. The marks are now
real elements in the one element you type into, so padding them moves
nothing. They carry `box-decoration-break: clone` so a mark broken across
a line wrap is drawn complete on both lines rather than losing its right
edge on the first. *(changed 2026-08-19.)*

Rounding stops at `--radius-sm`. A full `--radius-full` was drawn and
rejected: it makes the mark the same shape as the preview pill below it,
and a pill-shaped thing sitting in a line of prose reads as an object you
could pick up and move, which this is not — it is a run of your own text
that the parser has understood. *(added 2026-08-19.)*

### The field wraps, and grows

**A long todo wraps onto as many lines as it needs.** The field started as
a single line that scrolled sideways, and that was wrong in a way that got
worse the more the feature was used: text ran off the left edge with no
scrollbar to say so and no way back except walking the caret through it.

**The pills are what made it acute.** They rewrite the text as the single
source of truth ([the pills are controls](#the-pills-are-controls-and-they-edit-the-text)),
so choosing "Chores" from a menu can lengthen the line by more than it had
to spare — the line grew without a keystroke, and the words that fell off
the front were ones you never chose to hide. A control that hides your text
as a side effect of doing what you asked is the part that could not stand.
*(fixed 2026-08-19, reported from use.)*

**The field itself is unbounded and the modal is what yields.** The field
grows with its content and never scrolls, so no line of a todo is ever out
of view; the popup takes a `max-height` of `64vh` and scrolls internally
once the whole modal would otherwise outgrow the viewport. Bounding the
field instead was drawn and rejected — a cap on the field puts the text
back behind a scroll edge, which is the thing being fixed, and it does it
at exactly the length where the todo is hardest to read. Bounding the modal
moves the scroll to the frame around the text, where the pills and the two
buttons stay reachable at any length and short todos, which is nearly all
of them, never see a scrollbar at all.

Wrapping is why the field is a contenteditable rather than a `<textarea>`.
A textarea wraps perfectly well, and would have been the smaller change,
but it keeps the shadow layer and therefore keeps the unpadded mark: both
were measured, and the textarea drifted 52px. Wrapping and a padded mark
are one change or neither.

**The placeholder is a different example each time it opens**, drawn from
a list of about eighteen covering the whole grammar between them — bare
summaries, each token alone, and the combinations. The syntax is invisible
by design, so the placeholder is the only place it gets taught, and one
fixed example teaches one shape and then stops being read. Rotating puts a
different combination in front of you each time, so the grammar is absorbed
by use rather than looked up. *(added 2026-08-14.)*

### The pills are controls, and they edit the text

Each pill opens a picker or a menu, and choosing **rewrites the token in
the input**. Picking "Work" from the list pill edits `#chores` into
`#Work`; the parse then follows from the text exactly as if it had been
typed.

That is what keeps a single source of truth. The spec originally rejected
editable chips on exactly those grounds — a chip holding its own value can
disagree with the text, and every reconciliation rule is unpleasant. That
argument was about chips that *store* a value, and does not apply to a
control that edits the text and stores nothing.
*(changed 2026-08-14: the first cut shipped read-only pills.)*

**Every pill is always visible**, whether or not the text set it. An unset
one reads "Date" / "List" / "Priority" as a dashed outline and opens the
same control. This is what makes the syntax optional rather than required:
the grammar is the fast path for someone who knows it, and the pills are
the complete path for someone who does not. Drawing them only once a token
had been typed meant you had to already know `p1` existed to discover that
priority could be set at all.

**Date and time are two pills, each a native picker** — the same controls
the edit form uses ([todos](./todos.md#the-date-and-time-are-behind-switches)),
which on iOS is the wheel everyone already knows. The time pill appears
only once there is a date, since a time without one is not expressible in
`DUE`; clearing the date clears the time with it. The pair is written back
as one phrase (`2026-08-25 14:30`) so it round-trips as a single due rather
than two date matches that might not attach to each other.

*Rejected: a menu of canned days* (Today / Tomorrow / This weekend / Next
week). It could only ever cover the days someone thought of in advance, so
the moment you wanted the 25th it had nothing to say and you were back to
typing. A picker answers every date.

**Both menus mark the current value with a tick.** Weight alone was tried
and is not readable against a single row — and these menus are opened to
*check* a value as often as to change one.

### The summary has a length, and the modal has a place

**500 characters.** A summary is a *title*; prose belongs in the notes
field below it. Without a bound, the cost of every keystroke grew with the
text — the whole line is re-parsed and the marks can be redrawn — measured
at ~12ms per keystroke at 4,000 characters on a fast machine, so several
times that on an ordinary one, which is what holding `⌘V` felt like. A
paste past the limit is **truncated rather than refused**: pasting a
passage into a title is a slip worth softening, and the first 500
characters are the part that was wanted. *(added 2026-08-19, reported from
use.)*

**The modal rises rather than scrolling.** It sits at the launcher height
while it fits, and moves up as the field grows so the pills and the two
buttons stay on screen; only a modal taller than the whole viewport
scrolls, and then the layer around it scrolls rather than the box itself.

A `max-height` with an inner scrollbar was tried first and was wrong in
three ways at once: it clipped the `#` autocomplete, which is absolutely
positioned inside the popup; escaping that with fixed positioning detached
the menu from the field entirely; and it put a scrollbar on the common
case to serve a rare one. The placement is a collapsible spacer in a flex
layer — it asks for the launcher height and gives it back as the box
grows — so there is no measurement to keep in sync and nothing to
recompute on resize. *(added 2026-08-19, reported from use.)*

### What a contenteditable costs, and what it does not

A contenteditable hands you the rendering you want and takes back the
editing behaviour an `<input>` gives for free. Each of these is owned code
with a test behind it rather than something the platform does.

**Undo is preserved by not rewriting the DOM.** Measured 2026-08-19:
replacing `innerHTML` empties the browser's undo stack, so `⌘Z` after a
mark re-render does nothing at all, while ordinary typing, typing *inside*
a mark, and direct text-node writes all leave undo working. The rule that
falls out of that is **re-render the marks only when the set of tokens
changes**, never per keystroke. Most keystrokes change no token — typing
the middle of a word neither creates nor destroys a mark — so the DOM is
untouched for the great majority of edits and undo behaves natively.

**"Changed" means the marked words, not their offsets.** The first cut
compared each token's `start` and `end`, which looks equivalent and is
not: typing anywhere *before* a token shifts every later token along, so a
keystroke in the middle of the summary counted as a change and redrew. The
rare case had become the common one, and the guarantee was worth nothing.
Comparing the marked text instead is what makes the early return fire —
verified in the browser by tagging the mark elements and typing: the same
nodes survive. *(fixed 2026-08-19, found in use.)*

**The exception is honest rather than hidden**: the one keystroke that
completes or breaks a token (the `m` that turns `3p` into `3pm`) does
re-render, and loses its own undo entry. `⌘Z` from there undoes the
keystroke before it. This is a real if narrow regression against the old
`<input>`, it is the residue of a trade made deliberately, and it is
written down here so the next person to find it knows it was chosen and
not missed.

**Enter still submits and `Shift+Enter` still belongs to notes.** A
contenteditable inserts a line break on Enter by default, so both are
intercepted. The field wrapping does not make it a multi-line *input*: a
todo summary is one line of text that happens to be drawn on several, and
there is no key that puts a newline in it.

Writing the test for that found a bug older than this change: the Enter
branch did not check `shiftKey`, so **Shift+Enter from the summary
submitted the todo**. The `<input>` hid it — the field cleared as the
modal closed, so it read as a shortcut that did nothing rather than as an
accidental submit — and the wrapping field, which keeps its text visible
through the close, is what made it obvious. *(fixed 2026-08-19.)*

**Paste is forced to plain text.** A contenteditable pastes HTML by
default, with the source's fonts, colours and markup intact — paste a
sentence from a web page into an unguarded one and you get its stylesheet.
The handler takes `text/plain` and inserts that.

**The caret is addressed by text offset**, the same unit `replaceToken`
already works in, translated to and from a DOM `Range` at the edges. The
`<input>`'s `setSelectionRange` has no equivalent here. Verified that an
offset survives a mark re-render unchanged (20 → 20).

**The placeholder is drawn by CSS** on the empty state, since
`::placeholder` applies to form controls only.

**Focus on open is explicit.** `autoFocus` is a form-control attribute and
does nothing here, so without an effect the modal opened with focus still
on the button that opened it and the first thing typed went nowhere.
Likewise a caret a pill asks for is placed *and* focused: the menu that
requested it is still closing and holds focus for a frame after the modal
calls `focus()`, so gating on "is the field focused right now" dropped the
caret to the start of the line. *(both found in the browser 2026-08-19.)*

### Notes

The grammar deliberately does not cover notes: prose does not belong on a
line with tokens in it. A **"+ Notes" button** reveals a second field.

It is collapsed until asked for, so the common case is still one field.
**Tab reaches the button but does not fire it** — adding notes is a
deliberate act, and Tab means "move to the next control", not "create one".
Activating it, by pointer or by Enter/Space, focuses the field.

The field is styled as the summary field's smaller sibling — no border, no
focus ring, transparent — because two framed fields stacked would be the
form this modal exists to replace. It **grows and shrinks with its
content** and has no resize handle. It stays an ordinary `<textarea>`:
notes are prose with nothing to mark in them, so none of the reasons the
summary field gave up being a form control apply here.

### The footer

One line: a **Keyboard** help trigger on the left, the button on the right.

The keys are behind a popover rather than printed. Two permanent sentences
of instruction — "Enter to add", "Shift + Enter for a new line" — sat under
a modal whose whole argument is restraint, and were re-read every time to
say something you learn once. A quiet trigger keeps the answer one click
away for the day you want it and silent afterwards. It lists Enter,
Shift + Enter and Esc. *(changed 2026-08-14: was printed in the footer, and
before that a line under the notes field.)*

**A submit button, on every device.** Enter still submits; this is the same
action reachable by a finger, and by anyone who does not expect Enter to
post. It **matches the nav's "New todo" button** — the same
`action primary` from the shared stylesheet — because the two are the same
act at two ends: one opens this, one finishes it, and a bespoke quiet
outline made the second look like the lesser thing.

It is deliberately **not disabled** when the form is incomplete: a dead
button explains nothing, while pressing this one produces the error below.

### When there is nowhere to file it

On a derived view no list is inherited, so a line naming none cannot be
created. The footer says "**Choose a list for this todo**" as a
`role="alert"`, and the list pill marks itself at the same time.

**Only after a submit is attempted**, never while typing. Keyed on the text
alone it lit up on the first keystroke and stayed lit, which reads as an
error the whole time you are writing a perfectly good todo — nagging, which
is the one thing this app does not do
([overview](./overview.md) — product intent).

An earlier cut replaced the whole pill row with the sentence "Add #list to
choose where this goes", which hid the control that answers it at exactly
the moment it was needed. *(changed 2026-08-14.)*

## Enter creates and closes

The same as any other dialog. `N` reopens for the next one.

*Considered and rejected: stay open for bulk entry.* Ten todos at a sitting
is the motivating case, so a mode that keeps the field open after each
Enter is the obvious optimisation. It was declined because it makes the
modal stateful in a way the rest of the app is not — there is no other
place in Fold where a dialog stays open after its action succeeds, and the
"did that submit?" ambiguity costs more than the reopen keystroke saves.
The bulk case is already served: `N`, type, Enter is two keystrokes of
overhead per todo, and the parse is what removes the sixty.

If this proves wrong in use it is a small change, and it should be made on
that evidence rather than in advance.

## Failure and edge cases

**No tokens is a valid todo.** `Buy milk` creates exactly that: no date, no
priority, the default list. The feature is invisible until used.

**An empty summary after stripping is refused.** `tomorrow #chores p1`
parses to nothing but metadata, so there is no todo to create — submission
is blocked and the input keeps everything typed. The alternative, creating
a todo called "tomorrow", is worse.

**A literal `#` or `p1` in a summary.** `Fix issue #12` — `#12` is not a
list, so the autocomplete finds no match, nothing is consumed, and the text
stays in the summary. A token only ever binds when it resolves.

**On a list with no due dates** ([list-kinds](./list-kinds.md) — media
lists), dates are **not parsed at all**, and the date pill is disabled with
a popover saying why.

That is a two-pass parse (`QuickAddOptions.noDates`): the first pass
resolves the `#token`, and if the list it names takes no dates the second
runs with date matching off. The obvious alternative — parse, then discard
the due — was the first implementation and was wrong, because dropping the
date afterwards still strips the words that produced it from the summary:
"Finish Dune next Friday" filed into Reading became "Finish Dune", with the
date stored nowhere and two words deleted from the title.

Deriving this from the text rather than holding it in state is what makes
it reversible: retarget the same line at a list that does take dates and
the next render parses them again.
*(changed 2026-08-14, found in review.)*

**A second `#list` or `pN`.** The first binds; the rest is ordinary text.
A todo has one list and one priority, so there is nothing for a second
token to mean — and only the token that bound is marked, so the input says
which one counted. Both used to be marked and stripped while only the
first bound, so `#Chores #Work` filed into Chores with `#Work` highlighted
as though it had counted, and the word vanished from the summary either
way. Dates already behaved correctly, since chrono takes the first match
per segment. *(fixed 2026-08-15, found in use.)*

**"Now" is never a due date.** A todo due at this instant is overdue as
soon as it exists. This also removes a family of false positives rather
than listing them: chrono's casual parser reads a determiner followed by a
unit letter — "the s", "a s" — as *now*, so typing "sort out the shed" grew
a due date mid-word. A bare `today` is *not* caught by this, because it
leaves the hour uncertain; only a match asserting an hour can be now.
*(added 2026-08-14; narrowed 2026-08-15 after it swallowed `today`.)*

**A match that sets nothing is not a match.** chrono recognises spans that
name no date component at all: "this week" and "this year" both come back
with an empty set of known values, so neither the day nor the time branch
fires. The token used to be recorded anyway, which marked the words, took
them out of the summary, and set no due date — "Do the thing this week"
became a todo called "Do the thing", due never.

"This week" is ambiguous even in principle. chrono resolves it to
*tomorrow*, which is nobody's reading of it, so there is no correct date to
have set. Leaving the words in the title is the honest outcome: the todo
says what you typed. *(fixed 2026-08-17, reported from use.)*

**A day and a time can come from different phrases.** "Call them next
week when 3pm" sets both, because the day and the time are tracked
separately and the first of each wins. Only the first chrono match in a
segment used to be read, so the second was discarded before either could
be taken from it — the line above set the week, dropped the time, and left
"3pm" in the summary describing a due the todo did not have.
*(fixed 2026-08-19, reported from use.)*

**Offline** changes nothing. The parse is entirely client-side, and the
created todo queues through the outbox like any other
([sync-and-offline](./sync-and-offline.md)).

## It covers everything a todo has

Quick add covers summary, due, list, priority and notes — everything a todo
has. The **grammar** covers the first four; notes get their own field,
because prose does not belong on a line with tokens in it.
*(changed 2026-08-14: notes were out of scope in the first cut, reachable
only from the detail panel.)*

**Quick add is the only way to create a todo.** Both paths open it: the
global one (the sidebar button and a bare `N`), and the in-list "Add a
todo…" row. They differ in one prop — the in-list path presets the list
pill from the pane it was opened in, so the line never has to name a list,
while the global path starts with the pill empty and refuses to submit
until one is chosen.

The detail panel remains where a todo is edited after the fact.

*(changed 2026-08-14: the multi-field form at `add-todo-modal/` was
deleted. It survived the first cut of quick add because notes were out of
scope then and it was the only surface that had them; once quick add grew
a notes field it covered every field the form did — summary, due date and
time, list, priority, notes, and the `noDueDates` list-kind rule — and
keeping 568 lines of second add surface for no remaining capability was
the larger cost. The in-list path moved to quick add with the list
preset.)*

## Where it lives

- `todos/lib/quick-add.ts` — the parser, plus `replaceToken`, which is what
  lets a pill edit the text. Pure functions with no React, testable against
  a fixed `now`, in the domain's `lib/` per CLAUDE.md.
- `todos/quick-add-modal/` — the modal itself and the stylesheet the three
  components share.
- `todos/quick-add-pills/` — the two pill kinds: a picker wrapping a native
  date/time input, and a menu for the list and priority. Generic over what
  they show; neither knows about the grammar.
- `todos/quick-add-preview/` — the interpretation line, which arranges
  those pills and says what each does when chosen.
- `todos/lib/quick-add-labels.ts` — the date and time label formatters.
- `todos/quick-add-field/` — the editable itself: the contenteditable, the
  mark rendering, and the key and paste handling that a form control would
  otherwise have given for free. It takes a string and calls back with a
  string, and knows nothing about the grammar, the pills or the modal.
- `todos/lib/editable-caret.ts` — the two pure functions that convert
  between a caret offset in the plain text and a DOM `Range`, plus the
  predicate that decides whether a token set has changed enough to warrant
  a re-render. Pure and DOM-only, so they are unit-testable without React.

*(split 2026-08-15: `quick-add-modal.tsx` had reached 1257 lines, four
times the ~300-line soft ceiling in CLAUDE.md. Split again 2026-08-19: the
field came out as its own component rather than growing the modal back
past the ceiling it had just been brought under, and because an editing
surface with its own keyboard, paste and caret rules is a second concern
by any reading.)*
- `todos/add-todo-trigger/` — the in-list ghost row, which opens the same
  modal with `defaultListId` set.

Both paths write through `useGlobalAddTodo`, not `useTodoActions`. The
latter binds its list when the hook is called, which was right for a form
whose list could not change; quick add's pill can be changed even from
inside a list, so the write has to take the id at submit time or a
retargeted todo would silently file into the pane behind it.

## Testing

Unit tests own the grammar, against a **fixed reference date** so no test
depends on the day it runs ([testing](./testing.md)):

- each token type alone, and all four together in several orders;
- the summary is what remains after stripping;
- the no-token case produces a bare todo;
- non-tokens are left alone — `chapter 3`, `v2`, `issue #12`;
- `isCertain('hour')` maps to the right due kind, all-day vs timed;
- an empty summary after stripping is refused.

The caret and re-render helpers are unit tested too, against a real DOM
rather than a mock, since what is being asserted *is* DOM behaviour: an
offset survives a round trip through a `Range` and back, an offset inside
a mark resolves into that mark's text node rather than beside it, and the
re-render predicate says no for a keystroke that leaves the token set
alone and yes for one that changes it. That predicate is what keeps undo
native, so it is the piece worth pinning down.

E2E owns the wiring, not the grammar — `e2e/tests/quick-add.spec.ts`, one
spec rather than a re-enumeration of the parser cases:

- a full-grammar line round-trips to CalDAV with the right fields on the
  right list, and a plain line stays plain;
- a pill rewrites the text, and the parse follows from the new text;
- `#` opens the autocomplete, and `Ctrl+N`/`Ctrl+P` walk it;
- a derived view demands a list before it will create anything;
- notes are deliberate — they do not open by tabbing;
- the preview pills use the annotation face, not the reader's serif;
- the pill menus and the help popover are styled and paint above the
  modal;
- **a long line wraps instead of scrolling away**: the field is taller
  than one line, the first word typed is still on screen, and the buttons
  are still clickable. This is the regression the whole change exists to
  prevent, and it is asserted on geometry rather than on a class name;
- Enter submits from a wrapped line rather than adding a fifth line to it,
  and pasted text arrives as plain text.

That last one is regression coverage, not a design assertion. Eight
classes were once deleted from the stylesheet by a bad edit and nothing
caught it: a CSS Modules miss resolves to `undefined`, `cx` drops it, and
typecheck, lint, knip and the whole unit suite stayed green against a
completely unstyled menu. Asserting the computed style is the only layer
that sees it. *(added 2026-08-14.)*

**Date words in test fixtures are a trap.** A todo named "Made from
Today" loses the word to the parser, because `Today` genuinely is a date
— correct behaviour that looks exactly like a broken summary. Fixtures
that are not *about* dates should avoid date words entirely; the
happy-path todo is "Made from a derived view" for this reason.
*(added 2026-08-14.)*
