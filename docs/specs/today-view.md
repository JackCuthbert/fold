# The Today view

*(added 2026-08-02.)*

A dynamic view pinned above the real lists in the nav, showing everything
due today across every list.

It is a **view, not a collection**. Nothing is created on the server, no
CalDAV request is made on its behalf, and every todo continues to belong to
the list it was created in ([lists](./lists.md)).

## Appearance in the nav

**A ghost button — link appearance only.** No background, border or shadow,
in deliberate contrast to everything around it: list rows are segmented
buttons with real chrome, and "+ New list" carries the shared action
treatment. Being the one chromeless entry is what marks Today as a
different kind of thing.

**Separated by space, not a rule.** A wider gap below it than the gap
between list rows, and no divider. *(changed 2026-08-02: Today originally
composed the same button chrome as "+ New list" and relied on a divider to
set itself apart — which made a derived view look like just another button,
with a line doing the distinguishing. Ghost styling distinguishes it on its
own, so the divider became redundant.)*

Selected state matches a selected list row exactly — accent ink, medium
weight, the same leading marker — so "which view am I in" reads identically
whether it is Today or a list. Hover uses the same faint wash the list rows
use.

No kebab menu: there is nothing on the server to rename or delete.

## What it contains

**Overdue and due-today, from every list.** A todo whose due date has passed
stays in Today rather than disappearing — otherwise anything missed silently
leaves the view the next day and is only findable by visiting its own list.

- "Today" means the **viewer's local day**, consistent with the overdue rule
  in [todos](./todos.md#ordering-and-overdue-comparison).
- A todo with no due date is never in Today.
- Completed todos due today appear in the same "Completed (n)" accordion
  every list has — but **expanded by default here**, where a list view
  starts collapsed. Today is one day's slice, so the section is short and
  holds the day's finished work rather than an ever-growing archive, which
  is worth seeing at a glance. It stays collapsible; only the initial state
  differs. *(changed 2026-08-02.)*

## Ordering

By time, soonest first — using the same resolved instant that
[todos](./todos.md#ordering-and-overdue-comparison) defines, so all four
`DUE` forms are handled identically here and everywhere else.

Overdue items therefore sort to the top (their instant is in the past),
already marked by the existing overdue row treatment. Within the same
instant, ordering falls back to the standard rules — priority, then oldest
created — so it stays stable.

Ordering is **by time only**; a todo's list does not group or affect its
position. Rows show which list they came from, since they arrive from
several.

## Adding

**The "Add a todo…" ghost row does not render in Today.** A derived view has
no natural collection to add to, and silently picking one on the user's
behalf is surprising once there is more than one list. Completing, opening
and editing all behave exactly as in a list.

## Fetching

Today reads the **same per-list queries the lists themselves use**
(`['todos', listId]`), and filters across them. It does not introduce a
query of its own.

This is deliberate, and load-bearing rather than an optimisation:

- A todo completed in Today must update the cache its own list reads, since
  mutations are keyed by `listId`
  ([sync-and-offline](./sync-and-offline.md)). Sharing the query means the
  two views cannot disagree.
- The collection `ctag` short-circuit already makes an unchanged list cheap
  to re-check ([caldav-compliance](./caldav-compliance.md)), so the cost of
  "every list" is one conditional request per list, not a full fetch.

The consequence is that Today needs every list's todos loaded. With many
lists this is more requests than viewing a single list; the ctag check keeps
each one small. Worth measuring if list counts grow.

## Selection

Today is the default view on first load, and the selection persists like any
list. If a persisted list id no longer exists, selection falls back to
Today rather than to an arbitrary list.
