# The Next 7 days view

*(added 2026-08-14.)*

A derived view showing everything still to do **in the next seven days**,
across every list — the week in one screen.

Like [Today](./today-view.md) and [Tomorrow](./tomorrow-view.md) it is a
**view, not a collection**: nothing is created on the server, no CalDAV
request is made on its behalf, and every todo continues to belong to the
list it was created in ([lists](./lists.md)).

## The window

**Today through today+6 inclusive.** Seven local calendar days, counting the
day you are in as the first of them. So it starts today, not tomorrow.

**It deliberately overlaps Today and Tomorrow.** This is the one real
decision in the view, and it goes the opposite way from the disjointness
[Tomorrow](./tomorrow-view.md) argues for — so it needs its own reasoning
rather than an appeal to precedent.

The question this view answers is *what does my week look like*. A week that
begins the day after tomorrow is not a week; it is days three through seven,
which is a slice nobody has ever wanted to see. Excluding today and tomorrow
to preserve disjointness would produce a view whose name is a lie and whose
contents change meaning depending on which of its neighbours you last
visited.

Tomorrow's argument still holds where it was made, and this is not a
contradiction of it. Today and Tomorrow are **adjacent** windows: one begins
where the other ends, they are the same width, and a todo in both would mean
one of them had the wrong bound. This view is a **containing** window — it is
the span those two sit inside, plus five more days. A todo appearing in
Today and again here is not a duplicate; it is the same fact seen at two
zoom levels, which is what the two views are for. The views are never on
screen together, so there is nothing for the repetition to look wrong
beside.

*Rejected: starting at tomorrow* (today+1 through today+7). It keeps every
view disjoint from every other, which is tidy, and it was the first draft.
Two things killed it. The view is called "Next 7 days" and would have shown
a window whose first day you cannot get to from its name. And the rule it
was protecting turns out not to need protecting: disjointness matters
between views of the *same* granularity, where an overlap means one of them
is miscounting. It buys nothing between a day and the week containing it.

*Rejected: seven days from now, to the hour.* A rolling instant window
(`now` to `now + 168h`) is arithmetically neater and gets the count subtly
wrong all day: at 6pm on Monday it drops Monday-week's morning todos, so
the view quietly holds different work at breakfast than at dinner. Days are
what the user means. The window is computed with `addLocalDays`, the same
calendar arithmetic [Tomorrow](./tomorrow-view.md#day-arithmetic) uses and
for the same daylight-saving reason.

## What it contains

**Nothing overdue.** Bounded below at the start of today, exactly as
Tomorrow is bounded, and for Tomorrow's reason: an overdue todo is today's
problem, and [Today](./today-view.md) is already showing it. A forward view
that also carried everything you have already failed to do would answer
"what is coming, plus what I owe" — two questions, one of which has a view
of its own.

This is the one place the overlap does *not* extend. The window contains
Today's upper half but not its open-ended lower bound, so Today remains the
only view that chases missed work.

**Outstanding work only — there is no Completed section here.** The same
rule Tomorrow states, unchanged: a completed todo belongs to the day it was
*completed*, not the day it was due, which is how Today selects (on
`completedAt`) and how [Summary](./summary-view.md) groups. Ticking
something off here moves it to Today, under Completed, and it lands on the
real day in Summary.

The row vanishing on the click is correct rather than a glitch — it is no
longer something still to do this week.

- A todo with no due date is never here, as in Today and Tomorrow.

## Grouped by day

*(changed 2026-08-14, after design review: was a flat list.)*

**Rows are grouped under a heading per day, soonest day first**, using the
same day grouping [Summary](./summary-view.md) uses.

The first cut was one flat run of rows in time order, on the reasoning that
each row already carries its own due date so a heading would state it twice.
Seen running with a week of real data, that was wrong: it makes the obvious
question — "what's on this weekend?" — unanswerable without reading every
row's date pill. At seven todos it was already awkward; at twenty-five it
would be useless. A date pill answers "when is *this* one due"; a heading
answers "what is on *this day*", and the second is the question a
week-shaped view exists to answer.

**Reused, not reimplemented.** `localDayOf` and `dayLabel` come from the
Summary module, so a date buckets and reads identically in both views, and
the section markup is one shared `DaySection` component
(`todos/day-section/`). Only the grouping function is this view's own —
`groupByDueDay`, which buckets on the *due* instant where Summary buckets on
`completedAt`.

**Soonest first**, which is the one thing that could not be inherited.
Summary runs most-recent-first because it reads backwards from now; this
reads forwards, so the nearest deadline leads. Copying Summary's comparator
would have reversed the days and looked correct until you noticed the dates
descending.

**`dayLabel` was extended to read in both directions** rather than gaining a
forward-looking twin. It knew "Today" and "Yesterday"; it now also knows
"Tomorrow". One function because a day heading means the same thing in both
views, and two would let the same date read two ways depending on which view
you were in. It is shared with `formatTimestamp` (the detail panel's
metadata footer), so the extension was checked against that: the three
comparisons are against distinct days, so nothing that used to fall through
to the absolute branch stops doing so.

### Every day is drawn

All seven days in the window get a heading, **including the ones with
nothing due**. An empty day carries a single quiet line reading **"Clear"**.

*(changed 2026-08-14. This spec previously said the opposite — empty days
omitted, a fixed skeleton explicitly rejected — and the view was built that
way and used for a day. The reversal comes from that use, so the original
argument is kept below rather than deleted.)*

The rejected-skeleton argument ran: a quiet week would be mostly empty
headings, "a screen of chrome reporting nothing", and the absence of a
heading already reads as "nothing that day" because that is what absence
means. Both halves turned out to be wrong in practice, for the same reason.

**Absence is not legible as information.** A missing Thursday and a Thursday
you have not scrolled to look the same, and a week with work on Monday and
Friday reads as two days of work rather than as two busy days with three
clear ones between them. The gap has to be *drawn* to be counted.

**The density cost was mispriced.** The view is not a list that empty days
pad out; it is a week whose shape is the thing being read. Seven headings
are the fixed structure the work is placed into, so a quiet week reads as
quiet — which is a fact worth showing — rather than as a short view.

This is what the view is for. Both uses named when reversing it were about
the empty days specifically: seeing where there is room to schedule
something, and seeing the days that are genuinely free.

**"Clear", not "Nothing due".** Both are accurate. "Clear" reads as a day
off rather than as an absence of data, which matches what an empty day means
to someone planning a week.

**An empty day shows no count.** The day heading carries a row count
everywhere it has one, but a "0" beside a day already labelled "Clear" is
the same fact twice — on precisely the days that should be the quietest
thing in the view. A count earns its place by telling 1 from 7; at none
there is nothing to tell apart. *(added 2026-08-14.)*

The empty line is quieter than a row and quieter than the day heading above
it — `--faint`, at `--text-sm`, on the rows' shared left edge
([ui](./ui.md#spacing--rhythm) — one left edge). It holds a row's height so
the week does not concertina as work moves between days. It is deliberately
**not** a row: it has no checkbox column and nothing to open, so giving it a
row's geometry would invite a click it cannot answer.

**The skeleton is the view's rule, not the bucketing's.** `groupByDueDay`
still yields only days that have work — Summary shares it and must keep that
behaviour, since Summary's days are built *from* completed work and a day
with none is not part of its window at all. Next 7 days lays its buckets
over a separate `weekDays` skeleton, which is built from the same
`NEXT_7_DAYS_SPAN` the selection is bounded by, so a heading can never
appear that a todo could not land under.

### Health and Everything else, nested inside each day

**Both groupings are kept, one inside the other**: a day heading, then
*Health* and *Everything else* subheadings within it, then rows.

```
Today  1
  Mow the lawn            Chores · High

Sunday 16 Aug  2
  HEALTH
    Physio session        Health · 16 Aug
  EVERYTHING ELSE
    Clean the gutters     Chores · 16 Aug
```

The alternative was to let one axis collapse into the other — either lifting
health to a single block above the whole week (which files it under no date,
and would put next Thursday's medication above today's work) or dropping the
subheadings and letting health merely sort first within its day (Summary's
shape). Neither keeps both facts. Health leading is
[a rule](./list-kinds.md), and which day something is due is what this view
is *for*; a design that has to give up one of them is answering a smaller
question than the one asked.

**This is a deliberate departure from [Summary](./summary-view.md)**, which
groups by day and does *not* show a health subheading — there the heart
alone carries the category. Both follow the same rule applied to opposite
material. Summary's rows are already done, so there is nothing to chase and
no reason to lift them; this view's health work is still outstanding, so
[Today](./today-view.md)'s "impossible to leave unseen" argument applies —
per day rather than per view. Worth stating plainly because the two views
now genuinely differ and the inconsistency will otherwise look like a bug
someone should fix.

**The pair is all-or-nothing per day.** A day with only health work, or only
ordinary work, shows one uninterrupted run of rows under its date and no
subheadings. [list-kinds](./list-kinds.md) already states this for
"Everything else" — it appears only when there is a health section above it,
since with nothing to be distinguished from it would label the only thing on
screen. **The converse holds too**, which only became visible once the
headings nested: a bare *Health* over a day's single row is the same orphan
in the other direction. The first cut showed exactly that on two of seven
days, and it read as noise rather than structure. *(added 2026-08-14, from
looking at it rendered.)*

### Three heading levels

Nesting the two groupings means the view carries three levels — day, then
subheading, then row — and they have to be distinguishable without shouting.

The type scale cannot express it by **size**: `--text-base` is 15px and
`--text-sm` is 14px, so a size step between a day and its subheadings is a
1px difference nobody can see. Going *up* for the day heading was worse:
rows are themselves `--text-base`, so a larger day heading shouts over the
content it labels, against this app's register.

So the separation is carried by **weight, colour and case at once**: the day
heading stays medium-weight `--ink` at the row's own size, and the
subheadings are `--text-xs`, `--muted`, letter-spaced and uppercase.
Uppercase does the real work — it is the one signal that cannot be mistaken
for a heavier or lighter version of the heading above it, so the hierarchy
survives a glance rather than needing comparison. Measured in the browser at
both breakpoints before being settled. *(added 2026-08-14.)*

## Ordering within a day

By resolved due instant, soonest first, exactly as
[Today](./today-view.md) orders — `sortActiveTodos` then `sortByDueInstant`
before grouping, and `groupByDueDay` preserves incoming order, so the sort
survives. [list kinds](./list-kinds.md) group as they do everywhere: a
grocery list collapses to one row, and the day's count counts *rows*, so
that collapsed row counts once.

Nothing here is overdue, so the overdue row treatment never applies.

## Its own pane

*(changed 2026-08-14, after design review: was a third window on
`today-pane.tsx`.)*

It renders through `next-week-pane.tsx`.

The test [Tomorrow](./tomorrow-view.md#why-it-is-the-same-pane-as-today)
sets is whether the differences are *structural* or a parameter, and the
first answer here was "a parameter" — a wider window and nothing else. That
answer depended entirely on having rejected day headings. Design review
reinstated them, so the premise is gone and the answer changes with it.

What differs is now structural. `TodayPane` renders one flat run of rows,
with a single page-level health block above it and a Completed accordion
below. This renders N dated sections, each partitioning health *inside*
itself, and has no completed section at all. Sharing would mean three flags
deciding whether the health block is page-level or per-day, whether days
exist, and whether the accordion renders — which is the shape the
`TodoPane`-vs-`TodayPane` split already rejected once.

What *is* shared is shared properly rather than copied: `DaySection` draws a
day for this view and for Summary, which is what keeps the heading's
measured left-edge inset, the count-the-rows rule and the health partition
from drifting between them. It was Summary's own markup until this view
needed the same shape.

## Appearance in the nav

A ghost button, styled exactly as the other derived views, with
**`LuCalendarRange`** — a calendar with a range marked across it.

Today is a sun and Tomorrow a sunrise: both are *instants* in a day. This
view is a *span* of days, and the range is the one fact about it worth
encoding, since what distinguishes it from its neighbours is its width
rather than its position. `LuCalendarDays` was the alternative and says only
"a calendar", which is true of any of these. Both come from the same set as
every other icon in the app (CLAUDE.md — one icon collection).

It sits **third, between Tomorrow and Summary**, because the day views read
as a widening window: the day you are in, the day next, the week around
them — and only then what is behind you.

That position cost the two views after it their chords. Summary moved from
`Ctrl+Shift+3` to `Ctrl+Shift+4`, and Search from `Ctrl+Shift+4` to
`Ctrl+Shift+5`, since the chords are generated from the order of
`DERIVED_VIEWS` ([ui](./ui.md) — keyboard shortcuts).

Taken deliberately, and it is the same trade
[Tomorrow](./tomorrow-view.md#appearance-in-the-nav) took against Summary in
2026-08-05, settled the same way: appending instead — which is what Search
did, precisely to avoid this — was available and rejected. Search had no
natural place among the day views, so last cost it nothing. This one does
have a place, and a nav reading Today, Tomorrow, Summary, Search, Next 7
days would misfile a day view among the things that are not days,
permanently, to spare two relearned digits once.

## Adding

**No "Add a todo…" row**, for the reason Today and Tomorrow have none: a
derived view has no natural collection to add to. Completing, opening and
editing all behave exactly as in a list.

## The header count line

**Unchanged by the grouping**: it counts the whole view, so a week with
eight things due reads "8 todos" above eight rows spread over several days.

Checked rather than assumed when the day headings landed, since each day now
carries a count of its own and two kinds of number on one screen can
disagree. They do not, and the split is the same one
[list-kinds](./list-kinds.md) already draws for Today: the header answers
"how much is in this view" across every day, while a day heading labels one
specific stack of visible rows. Both count *rows*, so a collapsed grocery
row counts once in each, and the day counts sum to the header's.
*(added 2026-08-14.)*

## Empty

**The seven days are still drawn**, each reading "Clear". A week with
nothing in it is the same structure as any other week, with every day empty
— see [every day is drawn](#every-day-is-drawn).

*(changed 2026-08-14: an empty week used to render nothing at all, which
followed from empty days being omitted. That rule is gone, and this one went
with it.)*

The alternative — blanking the whole view once it happens to be completely
empty — would make the view change *shape* at zero rather than change
*content*, so the one week where "everything is clear" is the message would
be the one week that shows no days. It would also be the only derived view
whose layout depends on how much is in it.

No extra empty-state sentence is added on top, following
[Tomorrow](./tomorrow-view.md#empty): the title names the view, the count
line reads "No todos", the badge explains what is gathered, and now seven
"Clear" lines say it a fourth time. That is already more than enough.

## The list filter

Filtered like every other derived view: a hidden list's todos are absent
here too ([list-filter](./list-filter.md)). Nothing view-specific — the pane
receives the already-narrowed list array, which is the whole implementation.

## Fetching

Reads the **same per-list queries** everything else does
(`['todos', listId]`) and filters across them — see
[Today](./today-view.md#fetching), which explains why sharing those queries
is load-bearing rather than an optimisation.
