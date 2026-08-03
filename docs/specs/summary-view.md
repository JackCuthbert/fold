# The Summary view

*(added 2026-08-02.)*

A derived view of **finished work, grouped by the day it was finished** —
the answer to "what did I do yesterday?" before a standup.

Like [Today](./today-view.md) it is a **view, not a collection**: nothing is
created on the server, and every todo still belongs to the list it was
created in ([lists](./lists.md)). Where Today looks forward (what is due),
Summary looks back (what got done).

## What it contains

Every **completed** todo that carries a `COMPLETED` timestamp
([todos](./todos.md) — `completedAt`), from every list, grouped by the local
day of that timestamp.

- Days are the **viewer's local day**, consistent with Today and with the
  overdue rule ([todos](./todos.md#ordering-and-overdue-comparison)).
  `COMPLETED` is stored as a UTC instant, so the same todo can fall on
  different days for viewers in different zones — the local day is what the
  person reading it means by "yesterday".
- Most recent day first; within a day, most recently completed first.
- Days with nothing completed are omitted entirely rather than shown empty.
- A todo completed by another client that did not write `COMPLETED` cannot
  be placed on a day, so it is **excluded**. This is a real gap, not an
  error: RFC 5545 does not require the property alongside
  `STATUS:COMPLETED`. Rather than guess a day, the view says how many such
  todos it could not place.
- Rows show their source list, since they come from several.

## History depends on retention

Summary can only show todos that still exist on the server. **Deleting a
completed todo destroys the only record that it was ever done** — there is
no separate history store, by design: the CalDAV collections *are* the
data.

That makes bulk deletion of completed work a destructive act against the
historical record, not routine tidying. See
[todos](./todos.md#clearing-completed-todos) for how "Clear completed" is
gated as a result.

## Reading

Summary reads the **same per-list queries** the lists and Today use
(`['todos', listId]`), for the same reasons set out in
[today-view](./today-view.md#fetching): mutations are keyed by list, so a
shared query means the views cannot disagree, and the `ctag` short-circuit
keeps the fan-out cheap.

## Interactions

Rows open the detail sheet and can be edited or reopened exactly as
elsewhere. Un-completing a todo from here clears its `COMPLETED` stamp and
so removes it from Summary — correct, since it is no longer finished work.

There is no "Add a todo" row, for the same reason Today has none: a derived
view has no collection to add to.
