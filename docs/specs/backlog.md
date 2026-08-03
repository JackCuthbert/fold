# Backlog

Features agreed for a later session. Not built, not started — this is the
shortlist to pick up from next time.

Each needs its own spec section (and probably a plan) before implementation;
the notes below capture intent and the open questions worth answering first.

## ~~1. A "Today" view~~ — done 2026-08-02

Shipped. See [today-view](./today-view.md) for the full spec. The open
questions were settled as: the viewer's local day; overdue **and** due-today
(so nothing silently falls out of view); and the fan-out reuses each list's
existing query, so the `ctag` short-circuit already applies.

## ~~2. Due times, not just due dates~~ — done 2026-08-02

Shipped. A time field sits beside the date in both the add and edit forms,
empty for all-day todos; a time writes `zoned` (`DUE;TZID=…`) in the
viewer's timezone. See [todos — due times](./todos.md#due-times).

## 3. Bulk-clearing completed todos, safely

"Clear completed" was removed on 2026-08-02, the day `COMPLETED` capture
landed: it deleted the very records the [Summary](./summary-view.md) view is
built from, one click behind a single confirm. Individual deletion from the
detail sheet remains.

Something should replace it eventually, since completed sections do grow.
The open questions:

- **A heavy confirmation**, naming exactly what is destroyed (count, date
  range, "this removes them from Summary permanently")? Honest, but still
  one dialog between the user and months of history.
- **A retention rule** — only offer clearing for items completed more than
  N days ago, so recent history is never bulk-deletable. Needs a default N,
  and a way to show which items qualify.
- **Archive instead of delete**? There is nowhere to archive *to* — the
  CalDAV collections are the only store. A dedicated "Archive" collection
  is possible but adds a concept.

## 4. Reordering lists — designed 2026-08-03, not yet built

## 5. Per-list colours — designed 2026-08-03, not yet built

Items 4 and 5 were designed together, since both hang off an Apple
extension in the `http://apple.com/ns/ical/` namespace (`calendar-order`
and `calendar-color`) written by the same PROPPATCH. The open questions in
both — where the order lives, how a restrained palette coexists with
colours set by other clients — are settled there.

See [the design](../superpowers/specs/2026-08-03-list-colours-and-ordering-design.md).
It also covers a generic extension tooltip and an in-app help modal.

## 6. Derived-view todo rows

*(added 2026-08-03, deferred out of the colours/ordering design.)*

The [Today](./today-view.md) and [Summary](./summary-view.md) views draw
todos from every list at once, and their rows need design work before more
is added to them:

- **Show which list a todo came from**, using that list's colour. This is
  the natural home for list colours beyond the nav, and the reason colours
  stop at the nav in the design above — adding a colour to rows that are
  about to change would mean designing them twice.
- **Lower the density on mobile.** The rows are tighter than they should
  be on a small screen.
- **Let a todo wrap over more than one line** instead of truncating, so a
  long summary is readable.

Needs its own spec: all three change the same row, and density and wrapping
interact directly.
