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

## ~~4. Reordering lists~~ — done 2026-08-03

## ~~5. Per-list colours~~ — done 2026-08-03

Shipped together, since both hang off an Apple extension in the
`http://apple.com/ns/ical/` namespace (`calendar-order` and
`calendar-color`) written by the same PROPPATCH. The open questions were
settled as: the order lives on the server and the client picks a new list's
value as `max + 1`, so the two cannot disagree about where it goes; and the
palette is a shortcut rather than a constraint, so a colour set by another
client renders exactly as stored. Reordering is Move up / Move down in the
kebab menu — no drag-and-drop.

See [lists — colours](./lists.md#colours) and
[lists — ordering](./lists.md#ordering) for the specs,
[caldav-compliance](./caldav-compliance.md#extension-properties) for the
extension handling, and
[docs/user/colours-and-ordering.md](../user/colours-and-ordering.md) for the
user guide.

The work also produced a generic extension badge and an in-app help modal
([ui](./ui.md#the-extension-badge)).

See [the design](../superpowers/specs/2026-08-03-list-colours-and-ordering-design.md)
for the alternatives that were considered and rejected.

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

## 7. UI tweaks

*(added 2026-08-03.)*

Two independent items. The first is small; the second is not, and needs its
own spec before it is built.

- **Disable Save/Create until something changes.** The buttons are always
  enabled today, so saving an untouched form queues a no-op mutation and a
  pointless PUT. react-hook-form already tracks this as `formState.isDirty`,
  so the fix is small — but note the detail panel's fields are populated
  from a todo, so `isDirty` must be measured against those defaults, not
  against empty.

- **On desktop, make the detail panel a layout column, not an overlay.**
  The *right-hand* panel (the todo edit view, `todos/todo-detail.tsx`)
  should behave like the left-hand list sidebar does today: always part of
  the layout, no scrim, no dimming of the content behind it. Today it is a
  Base UI `Dialog` with a `.backdrop` at `z-index: 40`, sliding in from the
  right edge — an overlay at every viewport.

  *(The left nav already behaves correctly: verified live on 2026-08-03 at
  1280px — plain `<aside>`, pinned, no scrim, zero dialogs in the DOM. It
  is the model to copy, not something to fix.)*

  Not a small change — worth its own spec section, because dropping modality
  has consequences:

  - **Focus and Escape.** As a `Dialog` it traps focus and closes on
    Escape. A layout column shouldn't trap focus, but Escape-to-close is
    still wanted — that becomes a plain key handler, not Base UI's.
  - **The main column narrows** when the panel opens, so the todo list
    reflows. Worth checking against the sticky header and the scrollbar
    gutter work.
  - **"Nothing selected" becomes a real state.** As an overlay the panel
    simply doesn't exist when closed; as a column it either renders empty
    or collapses to zero width.
  - **Mobile keeps the bottom sheet** — this is a desktop-only change, so
    the component serves two structurally different modes, the same split
    `main-screen.tsx` already makes for the nav.

## 8. Keyboard shortcuts

*(added 2026-08-03.)*

- `Cmd/Ctrl+N` — new todo modal
- `Cmd/Ctrl+Shift+N` — new list modal
- `Cmd/Ctrl+F` — search, overriding the browser's find (see item 9)

Worth settling once, up front, rather than per-shortcut:

- **Where does the handler live?** One app-level listener that owns the
  whole map is easier to reason about — and to document in the help modal —
  than listeners scattered across components.
- **What happens when a modal is already open?** `Cmd+N` inside the detail
  panel should probably do nothing rather than stacking a second dialog.
- **Overriding `Cmd+F` is a real cost.** It takes away a browser function
  users rely on, so our search has to be clearly better than the browser's
  within the app. It should only bind when the app has focus and no text
  input is active.
- **Discoverability**: shortcuts nobody knows about may as well not exist.
  The help modal should list them.

## 9. Search view

*(added 2026-08-03.)*

A search view in the nav below Summary — a third derived view, so it
follows the pattern in [today-view](./today-view.md) and
[summary-view](./summary-view.md), including the `view:` sentinel prefix.

- **Fuzzy text search** across todo summaries (and descriptions?) from
  every list.
- **Filter buttons** for due, list, and priority, combinable with the text
  query.

Open questions worth answering before building:

- **Client-side or server-side?** Client-side over the already-cached
  todos is far simpler, works offline, and needs no new API — but only
  searches lists already fetched. Given the derived views already fan out
  over every list's query, this is probably the right call.
- **Which fuzzy algorithm, and do we need a dependency?** A small
  hand-rolled subsequence match may be enough; anything more wants a
  library rather than a home-grown ranking function.
- **Does a search have a URL / restorable state?**, or is it transient?
- **"Project" in the original note is a list** — Fold has no separate
  project concept, so this filter is by list.
