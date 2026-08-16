# Backlog

**The backlog now lives in GitHub Issues:**
<https://github.com/JackCuthbert/fold/issues>

*(moved 2026-08-03: a file was fine while the list was short, but it had no
state beyond a strikethrough, no way to link a branch or a commit to an
item, and it collected in-app todos and defects it was never meant to hold.
Issues give each item a lifecycle. Nothing was lost — every open item was
migrated with its full context.)*

## What moved

Nine items from this file, plus eleven todos from the in-app "Fold Backlog"
list, grouped into sixteen issues. Related small changes were combined
rather than filed separately, so a set of one-line CSS tweaks doesn't cost
five branches.

Labels: `feature` / `defect` / `docs` / `test-infra` mark what a thing is,
`needs-spec` marks work that needs a design before implementation, and
`priority:high|medium|low` carries the priority set on the original todo.

## Shipped before the move

Kept here because these entries recorded *why* something was settled the
way it was, and the specs they point at assume that context.

### ~~A "Today" view~~ — done 2026-08-02

See [today-view](./today-view.md). The open questions were settled as: the
viewer's local day; overdue **and** due-today, so nothing silently falls out
of view; and the fan-out reuses each list's existing query, so the `ctag`
short-circuit already applies.

### ~~Due times, not just due dates~~ — done 2026-08-02

A time field sits beside the date in both the add and edit forms, empty for
all-day todos; a time writes `zoned` (`DUE;TZID=…`) in the viewer's
timezone. See [todos — due times](./todos.md#due-times).

### ~~Reordering lists~~ and ~~per-list colours~~ — done 2026-08-03

Shipped together, since both hang off an Apple extension in the
`http://apple.com/ns/ical/` namespace (`calendar-order` and
`calendar-color`) written by the same PROPPATCH.

The open questions were settled as: the order lives on the server and the
client picks a new list's value as `max + 1`, so the two cannot disagree
about where it goes; and the palette is a shortcut rather than a constraint,
so a colour set by another client renders exactly as stored. Reordering is
Move up / Move down in the kebab menu — no drag-and-drop.

See [lists — colours](./lists.md#colours) and
[lists — ordering](./lists.md#ordering) for the specs,
[caldav-compliance](./caldav-compliance.md#extension-properties) for the
extension handling, and
`apps/docs/guide/colours-and-ordering.md` for the user guide.

The work also produced a generic extension badge and an in-app help modal
([ui](./ui.md#the-extension-badge)).

The alternatives that were considered and rejected — the colour-wash row
treatment, a local shadow copy of the order, and probing for extension
support — are recorded in [lists](./lists.md#colours) alongside the
decision each one lost to. *(changed 2026-08-15: the design document this
pointed at lived under `docs/superpowers/` and was deleted; its content is
in the spec proper.)*
