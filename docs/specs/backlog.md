# Backlog

Features agreed for a later session. Not built, not started — this is the
shortlist to pick up from next time.

Each needs its own spec section (and probably a plan) before implementation;
the notes below capture intent and the open questions worth answering first.

## 1. A "Today" view

A dynamic view pinned at the top of the nav, above the real lists, showing
every todo due today **across all lists**.

- It is a *view*, not a CalDAV collection — nothing is created on the
  server, and a todo continues to belong to its own list.
- Rows should make their source list clear, since they come from several.
- Interactions behave exactly as in a list: complete, open detail, edit.

Open questions:
- Does "today" mean the viewer's local day? (Probably yes — consistent with
  the overdue rule in [todos](./todos.md#ordering-and-overdue-comparison).)
- Should it include overdue items, or only ones due today? Overdue-plus-today
  is the more useful default.
- Fetching across every list on each load may be costly with many lists —
  the collection `ctag` short-circuit ([caldav-compliance](./caldav-compliance.md))
  should keep it cheap, but this needs measuring.

## 2. Due times, not just due dates

Support a time of day on `DUE`, not only an all-day date.

**The spec already allows this** — RFC 5545's `DUE` takes a `DATE-TIME`, and
[todos](./todos.md#due-dates-and-timezones) already models all four forms
(`date`, `utc`, `floating`, `zoned`). The codec reads and preserves them
today; the gap is purely UI: the pickers only offer a date, and our own
writes always produce all-day values.

So this is mostly interface work:
- A time field alongside the date, left empty for all-day todos.
- Decide which form *we* write when a time is given — `utc` is simplest and
  unambiguous; `zoned` better matches "9am wherever I set it".
- Display and sorting already resolve all four forms, so little should
  change there.

## 3. Per-list colours

A colour on each list, chosen from a picker in the list's edit menu, used
as a subtle accent in the nav and possibly on todo rows.

**The spec allows this too**: Apple's `calendar-color` (in the
`http://apple.com/ns/ical/` namespace) is the de-facto property, widely
supported including by Radicale, though it is an extension rather than part
of RFC 4791.

- Read it during list discovery; write it via `PROPPATCH` alongside
  `displayname` ([lists](./lists.md)).
- Treat it as **optional** — a server that rejects or ignores the property
  must not break list editing, in keeping with our "works with any
  compliant server" rule.
- Keep the palette restrained so it fits the minimal aesthetic: a small set
  of muted swatches rather than a free colour wheel.
