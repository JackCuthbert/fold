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

`list-kind.ts` holds the authoritative table; the shape of each set
matters more than the exact members:

| Kind | Names |
|---|---|
| `GROCERY_LIST` | `groceries`, `grocery`, `shopping`, `shop`, `supermarket`, `market`, `food shop(ping)` |
| `CHORES_LIST` | `chores`, `chore`, `housework`, `household`, `cleaning`, `errands`, `jobs`, `odd jobs`, `maintenance` |
| `MEDIA_LIST` | `reading`/`read`/`to-read`/`to read`, `books`; the same for watching and listening, plus `films`, `movies`, `tv`, `shows`, `albums`, `music`, `podcasts`, `games`; and `someday`, `someday/maybe`, `backlog`, `wishlist` |
| `HEALTH_LIST` | `health`, `wellbeing`, `well-being`, `wellness`, `medical`, `medication`, `meds`, `prescriptions`, `appointments`, `doctor`, `dentist`, `therapy` |

**The sets are sized by how loud a false positive is.** Grouping or
hiding a due-date field is a tidy-up you can undo by renaming; promoting
a list above everything else in Today is not, because the promotion is
unconditional and would outrank a genuinely urgent chore. So `HEALTH_LIST`
takes only names that mean *looking after my health* — `fitness`,
`exercise`, `gym` and `self care` are deliberately excluded, since such a
list is as often a training log or a wish list as a set of things to do,
and a training log pinned to the top of Today every day teaches you to
ignore the block.

`MEDIA_LIST` is the widest for the opposite reason: its only behaviour is
removing a field that such a list would not use anyway, so a generous
match costs nothing. `someday` and `backlog` are in it because they are
the same idea stated generically — a queue rather than a schedule.
*(expanded 2026-08-05: each kind began with only two or three names.)*

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

- **Always shown on a list of that kind, disabled when there is nothing
  outstanding.** A control that disappears takes the header's height with
  it, so ticking off the last todo made the list jump; and a recognised
  list should look the same whether or not you happen to be caught up.
  *(changed 2026-08-05: was hidden at zero.)*
- **Asks first.** It completes an unbounded number of todos at once and
  there is no undo, so it goes through the same `ConfirmDialog` a delete
  does ([todos](./todos.md)), naming the count.
- Emits one `updateTodo` mutation per todo, through the ordinary
  optimistic write path ([sync-and-offline](./sync-and-offline.md)). No
  new mutation kind: the outbox already coalesces and retries these, and
  a bulk kind would need its own conflict handling for no benefit.

### No due dates — `MEDIA_LIST`

A reading, watching or listening list holds things to **get to**, not
things due by a date. Its todos have no due date anywhere: the date and
time fields are absent from both the add form and the detail panel, and
priority is how you say what is next.

- **Hidden, not disabled.** A greyed-out field says "you can't set this
  here", which invites the question why; an absent one says the concept
  does not apply. The detail panel also greys every field on a completed
  todo, so a second greyed-out reason would be indistinguishable from
  that one.
- The add form's list picker means the target can change mid-form, so a
  due date typed before choosing a media list is **dropped on submit**
  rather than merely hidden.
- Existing due dates on a todo already in such a list are left on the
  server untouched — Fold stops offering the field, it does not go and
  rewrite data another client may have set
  ([caldav-compliance](./caldav-compliance.md)).

*(added 2026-08-05.)*

### Health first — `HEALTH_LIST`

Health todos **lead every derived view**, and in Today they sit in a
bordered block of their own above everything else.

**Unconditional, not a weighting.** A high-priority chore does not outrank
a health todo. An earlier design had health win only at equal priority
(Health/Medium beating Chores/Medium), which is subtler and arguably more
correct — but the resulting order is impossible to predict by looking at
it, and this view's whole job is to be scannable. Health is the one
category where "I'll get to it" is the wrong outcome, so it is not
competing on the same scale as everything else.
*(decided 2026-08-05: the issue comment proposed priority weighting.)*

**A border around the block, not around each row.** One bordered row would
be the loudest thing in a pane built on restraint ([ui](./ui.md)); a single
outline around several reads as a section — effectively its own small list
pinned above the rest, which is what it is. The tint inside is barely
there, and exists only so the block still groups where the border is
ambiguous against the row hairlines inside it.

- **Not collapsible.** The Completed accordion below folds away because it
  is a record of work already done. This is work still to do, and the point
  of lifting it is that it cannot be left unseen.
- **Ordered normally within the block** — by due instant, like any other
  Today row. Leading the view is about which block a todo is in, not about
  its time.
- **Completed health todos are not lifted.** A finished one needs no
  chasing, so it joins the ordinary Completed section.
- **Summary leads within each day, without the block.** That view is a
  record read by date, so lifting a health todo up the page would file it
  under the wrong heading; and the rows there are already done, so the
  block's "don't miss this" argument does not apply. The heart alone
  carries the category.

**A heart, but only where there is no block.** In Today's health block the
heading already says "Health" and each row names its list in the meta
cluster, so a heart there was the same fact stated three times. It appears
on the rows that sit *outside* a block — Summary, and Today's Completed
section — where nothing else marks them.
*(changed 2026-08-05: was on every health row, including inside the
block. Only visible once rendered.)*

Drawn in the muted `--list-red`, not a priority red: this is a category,
not an alarm. Where the block exists its heading names it in words, so
neither colour nor iconography is ever the only signal
([ui](./ui.md) — accessibility).

**The block stays inside the pane's measure, and its rows are allowed to
be indented.** Equal padding on all four edges; the border does not break
out of the reading column to make the rows inside line up with the todos
below.

This is a deliberate exception to [ui](./ui.md)'s one-left-edge rule, and
the second attempt at it. The first indented the rows *without* saying so,
which read as a mistake. The second pulled the border outward into the
pane's padding so the rows shared the checkbox column — which fixed the
alignment but broke the container's max width, trading a real edge for a
notional one. The block is a section of its own, so it may be indented
like one; what it must not do is escape the column everything else
respects.
*(changed 2026-08-05, twice.)*

**No bulk actions.** Health todos are ordinary todos in their own list;
everything about this kind is where they appear.

**The feature flag is `health`, not something generic.** It was `first`,
which promised a generality the code does not have: the heart, the red
palette and the literal word "Health" are all fixed at the view, so a
second kind setting a `first` flag would silently inherit a red heart and
prose about health. A specific name cannot be misread that way, and
`partitionHealth` / `isHealthTodo` match it.

The day a second kind wants a leading block of its own, generalise it
*then* — with two real cases to design the label, glyph and tone against
rather than one imagined one. Until then this is honestly one kind's
behaviour, the same way `groups` is honestly grocery-shaped.
*(renamed 2026-08-05: was `first`.)*

*(added 2026-08-05.)*

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
