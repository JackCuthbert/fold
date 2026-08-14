# The Tomorrow view

*(added 2026-08-05.)*

A derived view showing everything due **tomorrow**, across every list.

Like [Today](./today-view.md) it is a **view, not a collection**: nothing is
created on the server, no CalDAV request is made on its behalf, and every
todo continues to belong to the list it was created in
([lists](./lists.md)).

## Why it is the same pane as Today

Today and Tomorrow are one component (`today-pane.tsx`), given the day to
show. They share their source, their ordering, their grouping, their health
block and their Completed accordion — the day window is the only thing that
differs, so two copies would be a hundred duplicated lines that drift the
first time one of them is fixed.

*(added 2026-08-14: [Next 7 days](./next-7-days-view.md) is the third view
in this pane, on the same test. The `day` prop's three windows are now a
lookup keyed by its own union rather than a ternary, so a fourth cannot be
added to the prop without a selection to go with it.)*

This is the opposite call from `TodoPane` vs `TodayPane`, which stay
separate because they differ in where their todos come from, how they order
them, and whether they can create. The test is whether the differences are
*structural* or a parameter. Here it is a parameter.

## What it contains

**Due tomorrow only, bounded at both ends.** This is the one real
difference from Today, and the reason `selectTomorrow` is its own function
rather than `selectToday` with a shifted date.

- Today's lower bound is open, so overdue work keeps following you until it
  is dealt with. **Tomorrow has no such bound**: an overdue todo is not
  tomorrow's problem, it is today's, and Today is already showing it.
  Letting overdue items in would make the two views near-copies of each
  other and turn the one question this view answers — "what is coming?" —
  into "what is coming, plus everything I have already failed to do".
- A todo with no due date is never in Tomorrow, as in Today.
- Today and Tomorrow are **disjoint**: no todo is ever in both. They are
  adjacent windows, and an item in both would read as a duplicate.

  *(clarified 2026-08-14: this rule is about views of the same
  granularity — two day-wide windows, where an overlap means one of them
  has the wrong bound. [Next 7 days](./next-7-days-view.md) deliberately
  contains both of these and is not a counterexample: it is the span they
  sit inside rather than a third slice beside them. See that spec, which
  argues the distinction.)*

**Outstanding work only — there is no Completed section here.** A completed
todo belongs to the day it was *completed*, not the day it was due. That is
already how [Today](./today-view.md) selects (on `completedAt`) and exactly
how [Summary](./summary-view.md) groups, so Tomorrow simply follows the same
rule instead of having one of its own.

So ticking tomorrow's work off early moves it into **Today**, under
Completed, and it lands on the real day in Summary. The row does vanish
from Tomorrow on the click, and that is correct rather than a glitch: it is
no longer something to do tomorrow.

*(simplified 2026-08-05: the first draft kept early-completed todos in this
view so the row would not disappear. That cost a special case in
`selectTomorrow` and made Tomorrow the one view whose completed section
could contradict Summary about which day the work happened on. Deleting the
carve-out is what makes the day rule uniform — and it removes the question
of what to do about a todo whose `COMPLETED` timestamp another client never
wrote, since completed is simply completed.)*

## Day arithmetic

"Tomorrow" is the viewer's **local** calendar day after today, computed with
`setDate` rather than by adding 24 hours. That is what makes it calendar
arithmetic: it rolls the month and the year, and it lands on the same
wall-clock time across a daylight-saving boundary, where `+86_400_000`
would land an hour out and put a midnight todo on the wrong side of the day
boundary twice a year.

## Ordering, grouping and health

Identical to [Today](./today-view.md): by resolved due instant soonest
first; [list kinds](./list-kinds.md) group and lead exactly as they do
there. Nothing in Tomorrow is overdue, so the overdue row treatment simply
never applies.

## Appearance in the nav

A ghost button, styled exactly as Today and Summary, with a **sunrise**
icon against Today's full sun — the two read as a sequence at a glance.

It sits **second, directly after Today**, because that is the order the day
views read in: the day you are in, then the day next.

That position cost Summary its chord — inserting here moved it from
`Ctrl+Shift+2` to `Ctrl+Shift+3`, since the chords are generated from the
order of `DERIVED_VIEWS` ([ui](./ui.md) — keyboard shortcuts). Taken
deliberately: the alternative is permanent, and a nav ordered Today,
Summary, Tomorrow would look wrong every day from now on to spare one
relearned digit once.

*(changed 2026-08-14: [Next 7 days](./next-7-days-view.md) was inserted
after this view, so Tomorrow is no longer immediately above Summary and
Summary's chord moved again — to `Ctrl+Shift+4`. Tomorrow keeps
`Ctrl+Shift+2`; nothing at or above a newly inserted view ever moves. The
trade was settled the same way it was here, by the same argument.)*

## Adding

**No "Add a todo…" row**, for the same reason Today has none: a derived
view has no natural collection to add to. Completing, opening and editing
all behave exactly as in a list.

## Empty

**Nothing is drawn.** An empty Tomorrow is an ordinary state — most days,
in fact — and three elements already say so: the title names the day, the
count line reads "No todos", and the badge beside the title explains what
the view gathers.

Empty-state copy was written for this view and removed the same day. It
restated what those three already carried, which is one sentence too many
for the quietest state in the app. *(added and removed 2026-08-05.)*

## Fetching

Reads the **same per-list queries** everything else does
(`['todos', listId]`) and filters across them — see
[Today](./today-view.md#fetching), which explains why sharing those queries
is load-bearing rather than an optimisation.
