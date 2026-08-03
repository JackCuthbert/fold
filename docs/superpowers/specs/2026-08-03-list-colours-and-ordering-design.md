# List colours and ordering — design

Date: 2026-08-03

Covers backlog items 4 (reordering lists) and 5 (per-list colours), plus a
generic extension tooltip and an in-app help modal.

## Goal

Give each list a colour and a user-chosen position in the nav, both
persisted to the CalDAV server so they follow the user to other clients.
Both rely on Apple extensions rather than RFC 4791, so the app must say so
where the features are used and degrade cleanly where they are unsupported.

## Guiding rule

**The server is the source of truth, and Fold never rewrites what it did
not set.** This is the same rule as mutate-preserve VTODO editing
([round-trip-preservation](../../architecture/round-trip-preservation.md)):
a colour set by Apple Reminders renders exactly as stored, and editing a
list's name does not restyle it.

---

## 1. Shared foundation

Both features are the same shape — an optional property in the
`http://apple.com/ns/ical/` namespace on a collection, read during
discovery and written by PROPPATCH. The plumbing is built once for both.

### Schema (`packages/schemas/src/list.ts`)

`todoListSchema` gains two optional fields:

- `color?: string` — normalized `#RRGGBB`, validated by regex
- `order?: number` — integer

Both genuinely optional: a collection may carry neither. With
`exactOptionalPropertyTypes` on, absent and `undefined` stay distinct, so
"no colour" cannot be confused with "colour cleared".

### Gateway (`apps/server/src/caldav/tsdav-gateway.ts`)

- PROPFIND during `fetchLists` additionally requests `calendar-color` and
  `calendar-order`.
- Parsing is **defensive**: a malformed or unparseable value is treated as
  absent, never raised as an error. A foreign client writing garbage must
  not break list discovery.
- New gateway method `setListProps(listId, props)` PROPPATCHes either or
  both properties. Added to the `CaldavGateway` interface, so the fake used
  by handler unit tests implements it too.
- `createList` sends colour and order in the initial MKCALENDAR, so a list
  Fold creates is never orderless.

### Colour normalization

Apple writes **8 digits with an alpha suffix** — `#1D9BF6FF`. Fold stores
and renders 6.

- **Read:** strip a trailing alpha pair, uppercase, validate. Reject
  anything else as absent.
- **Write:** emit 8 digits with `FF`, because that is what Apple clients
  expect to find.

This is a named, unit-tested pair of functions in `packages/schemas` (or a
small module beside it) — never inline string slicing at a call site. It is
the highest-risk piece of parsing in the feature and gets tested both
directions, including the malformed cases.

### Mutation (`packages/schemas/src/mutation.ts`)

One new kind, `setListProps`, carrying `listId` plus optional `color` and
`order`.

One kind rather than two: colour and order are written by the same PROPPATCH
to the same namespace, and two near-identical kinds would duplicate a branch
in `applyMutationToLists`, the outbox, the engine's coalescing, and
`process.ts`.

**Coalescing:** consecutive `setListProps` entries for the same `listId`
merge into one, later fields winning per-field. Nudging a list up three
positions offline must queue one PROPPATCH, not three — and a colour change
followed by a move must not lose the colour. Field-wise merge (rather than
last-entry-wins) is what makes a single mutation kind safe here; see
[sync-and-offline](../../specs/sync-and-offline.md) for the existing
coalescing rules this follows.

---

## 2. Colours

### Palette and input

Eight restrained swatches, defined as tokens in `styles/tokens.css` and
tuned to Fold's warm palette rather than borrowed from Apple. Below them, a
hex text input and a native `<input type="color">`.

The palette is a **shortcut, not a constraint**. An existing Apple colour
renders exactly as stored and simply matches no swatch; the hex field shows
its true value. Nothing is ever snapped, rounded, or silently rewritten.

### Where the colour shows in the nav

- An **8px dot** before the list name, in every state — selected or not.
  Reuses the status-dot vocabulary already in the app, so it costs no new
  visual concept.
- The **active row's left marker** takes the list's colour instead of
  `--accent`.
- A list with **no colour** gets no dot and an `--accent` marker — exactly
  today's appearance, so uncoloured lists are not second-class.

The dot answers *which list is this*; the marker answers *which one am I
in*. Keeping the dot in every state means the identity signal never
disappears.

### The contrast guard

A user's colour can be arbitrary, and a pale one used as the selection
marker would make the selected row read as barely selected.

**If a colour's contrast against the current theme's `--paper` falls below
a threshold, the marker falls back to `--accent`.** The dot still carries
the colour regardless.

Computed from relative luminance against `--paper`, so one rule serves both
themes without a second palette. This is the only logic in the feature that
exists purely to stop a user's own choice degrading the UI, and it is
unit-tested with light and dark paper values.

*(Rejected: tinting the whole row's background to a wash of the colour.
Discussed and mocked up on 2026-08-03. It reads well with well-behaved
hues, but the blend depends entirely on the user's hex — saturated Apple
colours misbehave, hover and selected states both have to be re-expressed
in the list's colour rather than the app's, an uncoloured list reads as a
different kind of row, and the mix percentage needs a per-theme token. Too
much variance for too little gain.)*

### Where it is set

The list edit modal (`lists/list-form.tsx`), beneath the name field — the
same form that already handles rename, so a name and colour change save
together as one mutation rather than two.

### Reach — nav only, for now

Colours do not appear on todo rows. In the [Today](../../specs/today-view.md)
and [Summary](../../specs/summary-view.md) views todos come from every list
at once, where a colour would be genuinely useful — but that is a separate
question about row density, and the nav ships first.

---

## 3. Ordering

### Mechanism

**Up/down actions in each list's kebab menu are the contract.**
Drag-to-reorder via `@dnd-kit/sortable` is added on top only if it lands
cheaply.

Buttons are keyboard-accessible for free, work on touch without a
long-press gesture, and are e2e-testable without flake. Reordering is rare
enough that this is not a compromise — for a twice-a-year action it is
arguably the better interaction.

If drag is added, it uses a library (`@dnd-kit/sortable`), never a
hand-rolled implementation, and gets **one** Playwright test using explicit
mouse steps. If that test proves flaky it is deleted rather than chased,
and the flakiness is reported rather than hidden.

### Sort rule

1. Lists with an `order` sort by it, ascending.
2. Lists without an `order` sort alphabetically, **after** all ordered
   lists.

### New lists must not jump

A new list's order is **chosen by the client** as `max(existing order) + 1`,
applied optimistically and sent to the server as part of MKCALENDAR.

The server never invents an order value, so there is nothing for it to
disagree with when the response lands. This is strictly stronger than the
alphabetical fix it replaces ([lists — ordering](../../specs/lists.md#ordering)),
where the client was guessing at a position the server chose independently.

*(This is the regression that must not return: on 2026-08-01 a new list
appeared at one position and jumped when the server responded. Any change
to this rule must preserve the property that the client and server cannot
disagree about a new list's position.)*

### Reordering writes only what moved

Swapping two adjacent lists swaps two numbers — two PROPPATCHes, not a
renumber of the whole nav. Keeps the outbox small and never touches a list
the user did not ask to change.

### Degradation

If a server rejects or ignores `calendar-order`, the refetch returns lists
without an order and they settle alphabetically — visible, rather than
silently wrong.

*(Rejected: a client-side fallback order persisted to IndexedDB. It would
hold position on an unsupported server, but creates a local shadow copy
that can silently disagree with the server — a hard class of bug to reason
about later. One source of truth is worth the visible degradation.)*

*(Rejected: probing for support and hiding reordering entirely. Real
complexity for a situation Radicale users never hit.)*

This behaviour is documented in the help modal, not left for the user to
discover.

---

## 4. Extension tooltip and help modal

### `ExtensionBadge`

A small `LuInfo` icon in a **Base UI `Tooltip`**
(`@base-ui/react/tooltip`), generic and reusable, with a co-located CSS
Module. Placed beside the colour field and the reorder controls.

Content: this feature relies on a server extension outside RFC 4791; most
servers (including Radicale) support it; a server that does not will ignore
it rather than break. Links into the help modal.

**Touch:** a tooltip is hover/focus-only and hover does not exist on touch,
so the badge is a real `<button>` and must be tappable. If the tooltip
proves awkward on touch, tapping opens the help modal directly and the
tooltip is retained for pointer devices.

### Help modal

A `?` control in the nav footer beside Settings, opening a **Base UI
`Dialog`** styled exactly like `settings-modal.tsx` — same backdrop, popup
and animation treatment, inheriting the overlay rules in
[ui](../../specs/ui.md).

Sections, all short:

- The derived views (Today, Summary)
- Todos — due dates and times, priority, metadata
- Lists
- Colours and ordering
- Offline behaviour
- **Server extensions** — `calendar-color` and `calendar-order`, the
  8-digit alpha round-trip, and what happens on a server that ignores them

**The modal is deliberately a summary.** `docs/user/` remains the source of
truth for depth and gains a new `colours-and-ordering.md`. Duplicating
prose in two places guarantees one of them goes stale; the modal says what
each thing is and how it behaves, and nothing more.

---

## 5. Testing

Per [testing](../../specs/testing.md) — no duplication across layers.

**Unit**
- Colour normalization, both directions, including malformed input
- The contrast guard, against light and dark paper
- Sort rule with mixed ordered/unordered lists
- `max + 1` assignment for a new list
- `applyMutationToLists` for `setListProps`

**Integration (Radicale, Docker)**
- PROPPATCH round-trip for both properties
- Discovery parsing both properties
- A collection with neither property still discovers cleanly

**E2E (Playwright)**
- Reorder via the kebab buttons; assert the order survives a reload
- Set a colour; assert the dot renders
- Drag: one test, only if it is not flaky

---

## 6. Execution

**Sequential**, not parallel. Colours and ordering touch the same files —
`list.ts`, `tsdav-gateway.ts`, `mutation.ts`, `optimistic.ts`,
`list-nav.tsx` — and two agents editing that set concurrently would spend
more effort merging than either saved.

Order:

1. Shared foundation (schema, gateway, mutation) — for both properties at once
2. Colours
3. Ordering

**In parallel with step 1:** the `ExtensionBadge` and help modal, which
touch none of those files and are genuinely independent.

---

## Open questions

None. All decisions above were settled during brainstorming on 2026-08-03.
