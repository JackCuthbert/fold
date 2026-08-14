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

## What the modal looks like

A launcher, in the Alfred/Raycast sense: **one prominent input, and a line
underneath showing what the parse produced.**

```
┌────────────────────────────────────────────┐
│  Clean the gutters tomorrow at 3pm #chores │
│                                            │
│  Tomorrow 3:00pm   ● Chores   ⌃ High       │
└────────────────────────────────────────────┘
```

**The interpretation line is read-only and non-interactive.** It is
feedback, not a form: it says what will be created, using the same pills
the todo row uses ([ui](./ui.md) — two pill treatments) so the preview and
the result look like the same thing. Correcting a mistake means editing the
text, which is where the mistake is.

*Rejected: editable chips.* Chips that can be dismissed or changed
independently of the text put two sources of truth on screen — the text
says `tomorrow` and the chip says Friday — and the reconciliation rules
are unpleasant in every direction.

**No visible fields, no accordion, no Add button.** Enter submits. The
modal is the input and its echo.

**Recognised tokens are dimmed in the input** rather than removed as you
type. Removing them would fight the cursor; dimming shows what has been
understood without moving anything.

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

Quick add covers summary, due, list and priority. It does **not** cover
notes, which are prose and do not belong in a single line.

The detail panel remains the place to write them, and the modal keeps a way
through to the full form for a todo that needs one — so nothing becomes
unreachable, and the quick path stays quick by not growing fields.

## Where it lives

- `todos/lib/quick-add.ts` — the parser: text in, a `NewTodo` plus the
  matched ranges out. A pure function with no React, testable against a
  fixed `now`, in the domain's `lib/` per CLAUDE.md.
- `todos/quick-add-modal/` — the component and its styles.
- The existing `add-todo-modal/` keeps the full form. It is 568 lines today
  — already past the ~300-line soft ceiling — and moving the common path
  out is part of what brings it back under.

## Testing

Unit tests own the grammar, against a **fixed reference date** so no test
depends on the day it runs ([testing](./testing.md)):

- each token type alone, and all four together in several orders;
- the summary is what remains after stripping;
- the no-token case produces a bare todo;
- non-tokens are left alone — `chapter 3`, `v2`, `issue #12`;
- `isCertain('hour')` maps to the right due kind, all-day vs timed;
- an empty summary after stripping is refused.

E2E owns the wiring, not the grammar: that typing a line and pressing Enter
creates a todo with the right fields on the right list, and that `#` opens
the autocomplete and `Ctrl+N`/Enter picks from it. One spec, not a
re-enumeration of the parser cases.
