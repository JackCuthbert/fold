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

## 3. Reordering lists

Let the user arrange lists in the nav, persisted to the server so the order
follows them to other devices and clients.

- Lists currently render in whatever order the server returns
  ([lists](./lists.md#ordering)), which is effectively creation order and
  can't be changed from the app.
- Drag-to-reorder in the nav is the obvious interaction.

Open question: **where does the order live?** CalDAV has no standard
ordering property for collections. Apple uses `calendar-order` (the same
`http://apple.com/ns/ical/` namespace as `calendar-color`), which Radicale
supports — that's the most interoperable option, but it's an extension, so
it must degrade gracefully on a server that ignores it.

## 4. Per-list colours

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
