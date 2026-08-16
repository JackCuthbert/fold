# Lists (CalDAV collections)

A "list" is a CalDAV calendar collection that supports the `VTODO` component.
Full list management is in scope: discover, create, rename, delete.

## Data model (`packages/schemas`)

- **TodoList:** `id`, `href`, `displayName`, `ctag`, `color?`, `order?`.
- `id` is derived from the collection href, URL-encoded for use in API paths
  ([api](./api.md)).
- `color` and `order` are **genuinely optional** — a collection may carry
  neither, and a server may ignore both. `color` is the normalized
  `#RRGGBB` form (see [Colours](#colours)); `order` is an integer, where
  `0` is a real position rather than "absent". *(added 2026-08-03: both
  fields shipped with list colours and ordering.)*

## Operations

| Operation | CalDAV mechanism |
|---|---|
| Discover | PROPFIND on the calendar home set, filtered to collections whose `supported-calendar-component-set` includes `VTODO` (collections advertising no component set are included). Also requests `calendar-color` and `calendar-order` |
| Create | MKCALENDAR with `displayname` + VTODO component set, **plus `calendar-color` and `calendar-order` when set**; fallback to extended MKCOL if MKCALENDAR is unsupported |
| Update | PATCH carries any subset of `displayName`, `color` and `order`. The name goes via PROPPATCH on `displayname`; colour and order via a **single PROPPATCH** on the two extension properties |
| Delete | DELETE on the collection |

*(changed 2026-08-03: Rename became Update — one API call, because to the
user a name and a colour are one edit, but two CalDAV requests because
`displayname` and the Apple extensions are different properties. A `null`
colour or order clears the property with `D:remove`; `undefined` omits it
from the request so it is left alone.)*

Both extension properties live in the `http://apple.com/ns/ical/`
namespace and are **not** part of RFC 4791 — see
[caldav-compliance](./caldav-compliance.md#extension-properties).

## Colours

*(added 2026-08-03.)*

A list may carry a colour, stored in Apple's `calendar-color`. It is an
**extension**, not RFC 4791, and Fold treats it accordingly: useful when
present, absent without complaint when not.

### The 8-digit round-trip

Apple writes eight hex digits with an alpha suffix — `#1D9BF6FF`. Fold
stores and renders six.

- **Read:** strip a trailing alpha pair, uppercase, validate. A three-digit
  `#ABC` is expanded. Anything else is treated as **absent**.
- **Write:** always emit eight digits ending `FF`, because that is what
  other clients expect to find. Fold has no notion of a translucent list.

The pair is `parseListColor` / `formatListColor` in
`packages/schemas/src/list-color.ts` — named and unit-tested in both
directions, never inline string slicing at a call site.

**A malformed value is absent, never an error.** A foreign client writing
garbage into `calendar-color` must not break list discovery.

### The palette is a shortcut, not a constraint

Eight muted swatches, defined as tokens in `styles/tokens.css` and tuned to
Fold's warm palette rather than borrowed from Apple, plus a ninth **"No
colour"** swatch that clears it. Beneath them sit a hex field and a native
colour wheel, so **any colour is reachable**.

**Fold never rewrites what it did not set.** A colour set by another client
renders exactly as stored, simply matching no swatch; the hex field shows
its true value. Nothing is snapped, rounded, or silently rewritten — the
same rule as VTODO editing
([round-trip-preservation](../architecture/round-trip-preservation.md)).

Typing into the hex field has **three** outcomes, not two: a valid colour
sets it, an empty field clears it, and a half-typed value (`#1D9`) leaves
the stored colour alone. Folding "incomplete" into "cleared" would wipe the
colour on the way to typing a valid one.

### In the nav

- **An 8px dot before every list name**, in every state, selected or not.
  It answers *which list is this*.
- **A list with no colour still gets a dot**, drawn as an unfilled ring — a
  hairline circle, no fill. Every name therefore sits on the same left edge
  ([ui](./ui.md#spacing--rhythm) — one left edge), the row rhythm is
  identical down the nav, and assigning a colour never shifts a row
  sideways. An empty ring also reads as "no colour set yet" rather than as
  an absence.
- **The selected row's left marker takes the list's colour**, in place of
  `--accent`. It answers *which one am I in*.

### Wherever a list is named

The dot is not the nav's alone: **anywhere the app names a list, it draws
that list's dot**, with the same empty ring for an uncoloured one. A list
is recognised by its colour, and a surface that names it without one asks
the reader to recognise it a second way.

Five surfaces do this today — the nav, the pane title, the list filter
popover, the move-todo modal, and the add-todo modal's list picker (both
its closed trigger and its open options). All compose the dot's geometry
from `lists/list-dot.module.css` rather than each drawing a circle, so the
dot cannot drift between them.

The one exception is a **placeholder**: the add-todo picker before a list
is chosen shows no dot at all. There is no list there to be the colour of,
and an empty ring would read as an uncoloured list rather than as no
answer — which is the only thing that placeholder exists to say.
*(added 2026-08-14, issue #59: the add-todo picker was the one naming
surface with no dot.)*

### The contrast guard

A user's colour is arbitrary, and a pale one used as the selection marker
would make the selected row read as barely selected.

**If a colour's luminance sits too close to the current theme's `--paper`,
the marker falls back to `--accent`.** The dot always shows the true
colour, and nothing stored is ever changed — the guard is purely
presentational. `markerColor` in `apps/client/src/lists/lib/list-color.ts`.

Computed from relative luminance against `--paper`, so one rule serves both
themes without a second palette. It is the only logic in the feature that
exists purely to stop a user's own choice degrading the UI, and it is
unit-tested with light and dark paper values.

*(Rejected: tinting the whole row's background to a wash of the colour.
Mocked up 2026-08-03. It reads well with well-behaved hues, but the blend
depends entirely on the user's hex — saturated Apple colours misbehave,
hover and selected both have to be re-expressed in the list's colour rather
than the app's, and the mix percentage needs a per-theme token. An
uncoloured list also reads as a different kind of row — which the outline
dot solves for the chosen treatment but a wash cannot, since there is no
"empty" version of a background tint. Too much variance for too little
gain.)* *(merged here 2026-08-15 from a design document under
`docs/superpowers/`, which duplicated this spec's structure one level down
and was deleted; git holds the rest, which this file already covered.)*

The threshold is a WCAG relative-luminance delta, `MIN_DELTA = 0.09`, so
one rule serves both themes without a second palette. **It cannot be tuned
against light paper alone**: luminance is not perceptually uniform and the
two papers sit at opposite ends of the scale, so a threshold picked to look
generous in light mode rejects every swatch in dark mode and the marker
never takes a list's colour on a dark page at all. The viable window,
measured against the real palette, is 0.044–0.135; the value sits
mid-window.

## Ordering

*(rewritten 2026-08-03: user-defined ordering shipped. The previous
alphabetical rule survives as the fallback described below.)*

Lists sort by Apple's `calendar-order` — an integer per collection, in the
same extension namespace as the colour. `byListOrder` in
`apps/client/src/lists/lib/list-order.ts` is the one rule, used on read and on
optimistic insert alike.

1. Lists **with** an order sort by it, ascending.
2. Lists **without** an order sort alphabetically by display name,
   **after** every ordered list.

`0` is a real position and sorts first — the comparison tests
`!== undefined`, never truthiness.

### A new list must not jump

**A new list's order is chosen by the client** as `max(existing order) + 1`,
applied optimistically *and* sent to the server as part of MKCALENDAR.

The server never invents an order, so there is nothing for it to disagree
with when the response lands.

*(This is the invariant, not history: on 2026-08-01 a new list appeared in
one position and jumped when the server responded — the client was sorting
alphabetically while the server returned its own collection order, which is
unmatchable (Radicale returns collections in filesystem order of UUID
directory names). The rule above is strictly stronger than the alphabetical
fix that replaced it, because the client is no longer guessing at a
position the server chose independently. **Any change to this rule must
preserve the property that the client and server cannot disagree about a
new list's position.**)*

### Reordering writes only what moved

The mechanism is **Move up / Move down** in a list's kebab menu
([ui](./ui.md#the-nav)). Buttons are keyboard-accessible for free, work on
touch without a long-press gesture, and are e2e-testable without flake.
Drag-and-drop was deliberately not built — for a twice-a-year action the
buttons are arguably the better interaction.

Swapping two adjacent lists swaps two numbers: **two PROPPATCHes, not a
renumber of the nav.** The outbox stays small and a list the user did not
touch is never written. `reorder` returns `[]` at either end so the caller
can disable the control.

Either list in a swap may be unordered — a nav built entirely by another
client — in which case its current position stands in for the missing
number, which the sort above already agrees with. If the two values tie, a
gap is forced, so the swap actually changes the sort rather than resolving
back to the alphabetical tiebreak.

### Degradation

A server that ignores `calendar-order` returns lists with no order, which
then sort alphabetically — the behaviour that preceded this feature,
degrading **visibly rather than silently**. The same is true of one
property without the other.

*(Rejected: a client-side fallback order persisted to IndexedDB. It would
hold position on an unsupported server, but creates a local shadow copy
that can silently disagree with the server. One source of truth is worth
the visible degradation.)*

The [Today](./today-view.md) and [Summary](./summary-view.md) views are
pinned above these collections in the nav. They are derived, not
collections, so neither the colour nor the ordering rules apply to them.

## Behavior

- Lists appear in a sidebar (desktop) or drawer (mobile) — see [ui](./ui.md).
- Deleting a list requires confirmation (destructive; deletes all contained
  todos on the server).
- List create/rename/delete, colour changes and reorders all work offline
  and queue through the outbox like todo mutations
  ([sync-and-offline](./sync-and-offline.md)). Queued property changes to
  the same list **coalesce field-wise** into one PROPPATCH, so nudging a
  list up three positions offline queues one write rather than three — and
  a colour change followed by a move does not lose the colour.
  *(added 2026-08-03.)*
- The collection `ctag` is used to detect remote changes cheaply on refetch
  ([caldav-compliance](./caldav-compliance.md)).
