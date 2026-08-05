# List kinds

*(added 2026-08-05, issue #27.)*

A list's **name** says what kind of list it is, and Fold uses it. A list
called "Groceries" behaves differently from one called "Chores", without
anyone configuring anything.

## Entirely app-level

**No CalDAV property carries a kind.** No new `X-` field, no custom
namespace, nothing written to the server. A kind is derived from the
`displayName` Fold already reads, every time it is needed.

This is the constraint the feature is built around. Fold reads
`calendar-color` and `calendar-order` because Apple established them and
other clients honour them ([lists](./lists.md) — colours and ordering);
inventing a Fold-only property to carry a kind would break that principle
for no interoperability gain. A different client pointed at the same
server sees ordinary lists with ordinary todos, which is exactly right —
the kind is a *Fold* opinion about the list, not a fact about it.

The consequence: **renaming a list changes its kind.** That is intended,
and it is the escape hatch — see [Opting out](#opting-out).

## Matching

**Whole name, case-insensitive, or nothing.** A list matches a kind when
its display name, lowercased and trimmed, is one of that kind's names.
There is no substring matching and no fuzzy matching.

Substring matching was rejected deliberately: "Weekend Shopping List"
would match `SHOPPING`, and so would "Stop shopping impulsively" — a
todo-shaped list name that means the opposite. A rule that silently
changes how a list behaves has to be one the user can predict from the
name alone, and "is the name exactly this word" is predictable in a way
"does the name contain this word" is not.

| Kind | Names |
|---|---|
| `GROCERY_LIST` | `groceries`, `grocery`, `shopping` |
| `CHORES_LIST` | `chores`, `chore` |
| `MEDIA_LIST` | `reading`, `to-read`, `to read`, `watching`, `to-watch`, `to watch`, `listening`, `to-listen`, `to listen` |
| `HEALTH_LIST` | `health`, `wellbeing`, `well-being` |

**One kind per list.** A grocery list is a distinct thing from a chores
list, which is distinct from a reading list; a list that is somehow both
is a list that wants splitting. The name maps to at most one kind, and the
table above is checked for exact membership, so overlap is impossible by
construction rather than by precedence rules.

## What a kind unlocks

Only the behaviours below are implemented. The kinds exist as a closed
set so more can be added against a foundation that already works.

### Grouping in derived views — `GROCERY_LIST`

In Today and Summary, todos from a grouping list **collapse into a single
row** labelled with the list name and a count: "Groceries — 8 items".

The motivating case: ticking off Eggs, Bread and Milk produces three rows
in a view meant to summarise a day, and none is interesting alone. Nobody
reviewing their day wants to see that they bought milk; they want to see
that they did the shopping.

- Applies to **both active and completed** todos, grouped separately —
  eight things still to buy is one errand, not eight tasks.
- **Clicking the row navigates to the list**, exactly as clicking it in
  the sidebar would. The derived view stays a summary; the list stays the
  place you work through items one at a time. It does not expand in
  place: a disclosure inside a summary rebuilds the row-per-item view the
  grouping exists to avoid.
- Grouping is a **view concern**. `selectToday` and `summariseCompleted`
  keep returning todos and stay about time and nothing else; grouping is
  applied above them, in the panes.
- A group of **one** still groups. A row that appears and disappears
  depending on how much shopping is outstanding is harder to learn than
  one that is always the same shape.

**A group counts as one.** A day with eight groceries and two other todos
reads as three, not ten — the count counts rows, matching what is on
screen.

The first implementation counted the todos behind the group instead, on
the reasoning that the heading answers "how much did I get done" and
collapsing a row should not deflate it. Seen in place, that was wrong: a
heading reading "10" above three visible rows just looks broken, and the
reader has no way to reconcile the two numbers. Grouping is a claim that
the shopping *is* one errand, and the count has to agree with it or the
grouping is only half-applied.
*(changed 2026-08-05: was a count of todos.)*

The **header's** count line is deliberately left alone: it answers "how
much is in this view" across every list, where the individual todos are
what is being asked about, and it sits above the grouping rather than
beside it. Only the day heading, which labels a specific stack of visible
rows, has to agree with what is under it.

**A group is struck through when everything behind it is done**, the same
treatment a completed todo's summary gets. A part-done group is not: the
row stands for the errand, and the errand is outstanding until the last
item is ticked. Without this a Summary — where every todo is completed by
definition — showed the shopping looking as though it were still to do.
*(added 2026-08-05.)*

### Bulk complete — `GROCERY_LIST`, `CHORES_LIST`

One button in the list header: **complete every active todo in this
list**. Not a selection model — there is no multi-select anywhere in
Fold, and this needs none. You have done the shopping; the whole list is
done.

- Only shown when the list has at least one active todo.
- **Asks first.** It completes an unbounded number of todos at once and
  there is no undo, so it goes through the same `ConfirmDialog` a delete
  does ([todos](./todos.md)), naming the count.
- Emits one `updateTodo` mutation per todo, through the ordinary
  optimistic write path ([sync-and-offline](./sync-and-offline.md)). No
  new mutation kind: the outbox already coalesces and retries these, and
  a bulk kind would need its own conflict handling for no benefit.

### Bulk schedule — `CHORES_LIST`

One button in the list header: **set every active todo in this list to
the same due date**. Chores are the case — Saturday's jobs are all due
Saturday, and setting seven due dates by hand is seven trips through the
detail panel.

Same shape as bulk complete: a confirm naming the count, one `updateTodo`
per todo, no new mutation kind.

## The sparkle

A list with a recognised kind is marked with a sparkle
(`LuSparkles`, from the one icon set — CLAUDE.md), in **both** the nav
row and the list's own title.

It has to be visible in both places. The behaviour is otherwise invisible
until it surprises you, and the glyph is what makes "why is my list doing
that?" answerable — it is the thing you hover or tap to find out.

- In the **title**, the sparkle is an `InfoBadge` trigger
  ([ui](./ui.md) — a popover, not a tooltip) whose prose names the kind
  and lists what it unlocks. This is the same pattern the extension
  badges use, which are the nearest existing thing: a marker that says
  "this list has a capability".
- In the **nav**, it is a bare glyph with no popover. Every nav row is
  one button and nothing else — that rule is why the derived views' info
  badges moved out of the nav in the first place *(2026-08-04)*, and a
  second interactive control in a list row would undo it. The nav sparkle
  is a marker; the title sparkle is the explanation.
- It must not collide with the extension badges, which mean something
  adjacent but different: server support, versus app behaviour.

## Opting out

**Not in this version.** A list that matches a kind gets that kind, and
renaming it is the way out.

An override has nowhere good to live. On the server it would be a custom
property, which the whole feature is defined against. Locally it would
not follow you between devices, which every other piece of list state
deliberately does ([lists](./lists.md) — colours and ordering are stored
server-side for exactly that reason). Neither is worth building before
there is evidence the heuristic is actually wrong for a real list.

*(decided 2026-08-05: deferred rather than designed. The matching rule is
strict enough — whole name only — that a false positive requires naming a
list exactly "chores" and not wanting chores behaviour.)*
