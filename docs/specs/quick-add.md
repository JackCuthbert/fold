# Quick add

*(added 2026-08-14.)*

One text field that creates a todo. You type
`Clean the gutters tomorrow at 3pm #chores p1`, press Enter, and get a todo
called "Clean the gutters", due tomorrow at 3pm, in Chores, at high
priority.

This replaces the [add-todo modal's](./todos.md) form — a summary field, a
list picker, and an Advanced accordion holding due date, time and notes —
for the common case. The form is not deleted; see
[the full form](#the-full-form-is-still-there).

## Why

**Creating a todo is the most frequent action in the app and the slowest.**
The current modal is a field, a dropdown, and a disclosure hiding three more
fields. A todo with a due date and a priority costs a click to open the
accordion, two date/time interactions and a select — for information that
takes two seconds to *say*.

The owner creates up to ten at a sitting. Ten todos through the current form
is roughly sixty interactions, and the friction is per-todo rather than
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
| `p1`–`p4` | Priority | `p1` high, `p2` medium, `p3` low, `p4` none |

**What is left after removing every recognised token is the summary**, with
surrounding whitespace collapsed. `Clean the gutters tomorrow at 3pm #chores
p1` leaves `Clean the gutters`.

### Priority is `p1`–`p4`, matching Todoist

Not `!high` or `!!`. `p1`–`p4` is the convention in the tool most people
arrive from, it is unambiguous against ordinary prose, and it is four
keystrokes for the whole vocabulary.

Fold has three priority levels plus none ([todos](./todos.md) — priority),
so the mapping is `p1`→high, `p2`→medium, `p3`→low, `p4`→none. `p4` is
accepted rather than rejected: it is what a Todoist user types to mean "no
priority", and silently leaving it in the summary would be worse than
honouring it.

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

A launcher, in the Alfred/Raycast sense: **one prominent input, a row of
pills under it showing what the parse produced, and a footer.**

```
┌──────────────────────────────────────────────┐
│  Clean the gutters tomorrow at 3pm #chores   │
│  + Notes                                     │
│  [● Chores ▾] [Tomorrow ▾] [3:00pm ▾] [High ▾]│
│  ⓘ Keyboard                      [ Add todo ]│
└──────────────────────────────────────────────┘
```

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
same 12% the preview pills use, square, and with no padding of their own.
*(changed 2026-08-14: they were dimmed to `--faint`, which read as "this
part didn't count" when the opposite is true — a mark is the parser
saying it understood.)*

The mark cannot be padded, and this is a hard constraint rather than a
preference. What you type into is a real `<input>`; the marks live in a
shadow layer beneath it holding the same text at the same metrics, and an
`<input>` cannot pad individual characters. Padding the shadow's tokens
therefore moves that layer's text and nothing else — measured in review,
4px of padding plus 2px of margin across three tokens put the caret 34px
from the glyphs it belonged to, worsening with each token. So the mark is
drawn with a `box-shadow` spread, which paints outside the inline box
without contributing layout.

That spread is **vertical only**. A uniform spread also grows the mark
sideways by enough to bridge the single space between two tokens: with
one, `tomorrow at 3pm #Chores p1` left 0.73px between marks and read as a
single continuous block. Confining it to the y axis leaves the spaces
unmarked — 4.73px of clear ground — so adjacent tokens read as separate
marks while the text stays in exact register. *(added 2026-08-14.)*

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

### Notes

The grammar deliberately does not cover notes: prose does not belong on a
line with tokens in it. A **"+ Notes" button** reveals a second field.

It is collapsed until asked for, so the common case is still one field.
**Tab reaches the button but does not fire it** — adding notes is a
deliberate act, and Tab means "move to the next control", not "create one".
Activating it, by pointer or by Enter/Space, focuses the field.

The field is styled as the summary input's smaller sibling — no border, no
focus ring, transparent — because two framed fields stacked would be the
form this modal exists to replace. It **grows and shrinks with its
content** and has no resize handle.

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

The same as today. Cmd/Ctrl+K reopens for the next one.

*Considered and rejected: stay open for bulk entry.* Ten todos at a sitting
is the motivating case, so a mode that keeps the field open after each
Enter is the obvious optimisation. It was declined because it makes the
modal stateful in a way the rest of the app is not — there is no other
place in Fold where a dialog stays open after its action succeeds, and the
"did that submit?" ambiguity costs more than the reopen keystroke saves.
The bulk case is already served: Cmd+K, type, Enter is three keystrokes of
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
lists), a parsed date is dropped, exactly as the current form drops one:
the preview shows the date struck through with the list's name beside it,
so the reason is visible before submitting rather than after.

**Offline** changes nothing. The parse is entirely client-side, and the
created todo queues through the outbox like any other
([sync-and-offline](./sync-and-offline.md)).

## The full form is still there

Quick add covers summary, due, list, priority and notes — everything a todo
has. The **grammar** covers the first four; notes get their own field,
because prose does not belong on a line with tokens in it.
*(changed 2026-08-14: notes were out of scope in the first cut, reachable
only from the detail panel.)*

**Quick add is the only way to create a todo.** Both paths open it: the
global one (the sidebar button and `Cmd/Ctrl+K`), and the in-list "Add a
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
- `todos/quick-add-modal/` — the component and its styles.
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
  modal.

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
