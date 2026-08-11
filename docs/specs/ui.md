# UI & Visual Design

Minimalist, elegant, fast. **Mobile-first** — the phone layout is the design,
and it scales up to desktop rather than the reverse.

*(rewritten 2026-07-31 after design review: the original was a desktop layout
with a mobile fallback, used an ad-hoc type scale, and put sync status front
and centre.)*

## Layout

*(revised 2026-07-31 after design review — items below marked with the date
supersede earlier wording.)*

- **Left nav, collapsible, hidden by default.** It holds lists ([lists](./lists.md))
  and a link to Settings — not primary content. On desktop
  (≥768px) it may stay pinned open; on mobile it overlays with a scrim.
  Dismissible by Escape, scrim tap, or selecting a list.
- **The list title is centred above the list** and visually distinct from
  the rows beneath it — it is the heading for the content, so it should
  read as one. *(added 2026-07-31.)*
- **Mobile: the nav trigger sits beside the list title**, not as a floating
  button in a corner. Title and trigger form the top row of the content
  column. *(added 2026-07-31: the floating button read as stray chrome.)*
- **Clear separation between quick-add and the list.** The add affordance
  and the todo rows must not crowd each other; use the spacing scale to
  give the list its own block. *(added 2026-07-31.)*
- **No top bar at all.** *(clarified 2026-07-31: a slim header still
  existed; it is now removed entirely.)* The list title is the first
  heading of the content column, not a separate bar. Configuration —
  sign out, sound toggle, sync status — lives at the **bottom of the left
  nav**, since that is what the nav is for.
  - On mobile the nav is hidden, so a single floating control opens it.
    That trigger is the only persistent chrome; it must not become a bar.
  - Content therefore starts at the top of the page on desktop.
- **Main content is centred** with a comfortable measure (max ~34rem) so it
  reads well at any window width.
- **Todo pane:** quick-add at top; active todos per [todos](./todos.md);
  completed in a collapsible section with a count. No bulk delete —
  see [todos](./todos.md#clearing-completed-todos). *(changed 2026-08-02.)*
- **Detail view:** tapping a todo opens a **bottom sheet on mobile** and a
  **layout column on desktop** — never an inline expansion that shifts the
  list. *(changed 2026-08-03, issue #4: the desktop panel was a modal side
  panel — a dialog with a scrim, dimming the list behind it, at every
  viewport. On desktop it is now part of the layout exactly as the left nav
  is: a third flex column after `<main>`, with no scrim and nothing dimmed,
  so the list stays readable and clickable while a todo is open and another
  todo can be opened without closing this one first. Mobile is unchanged
  and keeps the modal sheet.)*
  - **On a narrow desktop the nav yields to it**, rather than three fixed
    columns crushing the list — see "The nav" below for the 1280px
    threshold and the restore rule. *(added 2026-08-03.)*
  - **Nothing selected collapses to zero width.** The column is always
    mounted and animates its width — the same treatment as the desktop nav
    — and is `aria-hidden` and `inert` while closed, so it is invisible to
    assistive tech and unreachable by Tab. Deliberately **not** an
    empty-state placeholder: this is a single-user app whose owner knows
    what the panel is, and a permanent "select a todo" panel would spend a
    third of the screen saying nothing.
  - **It is not modal, and must not pretend to be.** No focus trap — the
    user must be able to Tab out into the list, which is the point of
    dropping modality. It is a labelled `region`, never `role="dialog"`:
    claiming dialog semantics would tell a screen reader the rest of the
    page is inert when it is not.
  - **Escape still closes it**, as a plain key handler scoped to the panel
    rather than Base UI's. Scoped deliberately: Escape pressed out in the
    list belongs to whatever has focus there, not to this panel.
  - **Focus moves into the panel on open and returns to the row on close.**
    Without that a keyboard user loses their place. The heading takes focus
    rather than the first field, so a stray keystroke can't edit the todo.
    The returning target is the row element captured explicitly when it was
    clicked — the same reason the add-todo modal passes an explicit
    `triggerRef` rather than trusting a heuristic that a re-render can
    invalidate. Re-clicking the row that is already open pulls focus back
    in too, since that click remounts nothing.
- **Adding a todo opens a modal.** *(added 2026-07-31: an inline field made
  adding feel incidental and gave no room for detail.)* Clicking "Add a
  todo" opens a dimmed modal containing a form that is fully keyboard
  navigable:
  - A single **title** field is the focus and the fast path — type, press
    Enter, done.
  - An **Advanced** accordion, collapsed by default, holds **due date,
    priority and notes**, so a todo can be fully specified at creation
    without opening it afterwards.
- **Settings** *(added 2026-07-31)*: sound and sign out live in their own
  modal, opened from a "Settings" entry in the nav footer — they are not
  loose controls in the nav. The footer keeps only that entry and the
  status dot. The modal also shows the **CalDAV server URL, read-only** —
  useful to confirm which server you're on; changing it means signing out.
  Controls inside need breathing room from any divider beneath them.
- **"Add a todo" has a desktop hover state** — a full-width fill, no
  border, distinct from the todo rows beneath it so it reads as an action
  rather than another item. *(added 2026-07-31.)*
- **Login** ([authentication](./authentication.md)): server URL, username,
  password via react-hook-form.

## The nav

*(added 2026-07-31: list rows were truncated to ~119px of a 207px row by
two inline icon buttons, and Settings sat 20px right of every list item.)*

Every row in the nav is **the same shape and shares one left edge** — list
items, the create action, and Settings alike. Specifically:

- **List rows are full width.** The name takes the row; it is never
  squeezed by inline controls.
- **Per-list actions live in a kebab menu** (`⋮`) at the row's right edge,
  holding Rename and Delete. Base UI's `Menu` supplies the keyboard and
  focus behaviour.
- **The row is a segmented button.** *(added 2026-07-31.)* The name and the
  kebab read as **one control split into two segments** — a shared outer
  shape with a hairline divider between them — not an icon floating over a
  row. The kebab is always visible.
- **Settings needs breathing room** above the divider that separates it
  from the status line; it must not sit flush against it.
- **Creating a list opens a modal**, like every other create/edit surface —
  not an inline form that changes the nav's shape while open.
- **The footer matches the rows.** Settings and the status line align to
  the same left edge and use the same row height as the list items above
  them.
- **The footer is one group.** *(revised 2026-07-31.)* There is **no
  divider between Settings and the status line** — they belong together.
  A single divider sits *above* Settings, separating the whole footer from
  the list, with clear space between that divider and the Settings row.
- **Settings is a ghost icon button inline with the sync status.**
  *(revised 2026-08-01: as a full-width bordered row it read as a heavier
  action than it is.)* No background or border until hover; it sits on the
  same line as the status dot and label rather than stacked above them,
  so the footer is a single quiet row.
- **The nav is headed by the app's mark** — an origami icon plus "Fold", in
  semibold. *(changed 2026-08-02: was the text "Lists". With Today, Summary
  and the collections all below it, "Lists" described only part of what
  follows; the app's own name identifies the panel instead. Origami for the
  folded paper the name means.)*
  *(changed 2026-08-04: it now **matches the detail panel's heading** — the
  same type size and the same uniform padding. Both are the title of a
  full-height column, and at a step smaller the nav read as a lesser part
  beside the panel. This supersedes the earlier "stays compact" rule
  (2026-08-01), which was written when the nav's heading had nothing to be
  consistent with.)*
  *(changed 2026-08-04: **left-aligned**, on the rows' shared edge. It was
  centred on 2026-08-03 on the reasoning that the mark is the brand rather
  than a nav row and should sit apart; in practice the exception read as an
  oversight, and "one left edge" below is better applied to the whole
  column than with the heading exempted from it.)*
  - **The favicon is the same mark** (`public/favicon.svg`), so the tab and
    the nav agree. The glyph is duplicated there rather than imported:
    react-icons is a bundled runtime dependency, and a favicon is served
    statically before any JS runs — so changing the nav mark means changing
    that file too. It is theme-aware via `prefers-color-scheme` (a favicon
    renders outside the app's DOM and cannot inherit the design tokens),
    with flat-ink PNG fallbacks for browsers that don't support SVG icons.
    *(added 2026-08-04: there was no favicon at all, so tabs showed the
    browser's default globe.)*
- **"New todo" sits at the very top of the nav**, above Today and Summary
  and set apart from them (issue #15). It is the app's most frequent
  action; grouping it with the derived views would read as a fourth place
  to *look* rather than a thing to *do*. It carries the accent fill —
  nothing above it competes — and prints its chord on its trailing edge, so
  the shortcut is discoverable from where a mouse user is already looking
  (see keyboard shortcuts below). The chord is derived from the same
  constant that binds it, so the button cannot advertise a binding the app
  does not have. *(added 2026-08-04.)*
  - **This is a second path to adding a todo, not a replacement.** The
    in-list "Add a todo" row stays: it is faster when you are already in
    the list, and its target is implicit. The sidebar button has no
    implicit list, so its form carries a picker.
  - **No default list, deliberately.** The picker opens on "Choose a list…"
    and refuses to submit without one. Filing a todo into a list the user
    never looked at is worse than asking which one — a wrong guess is
    invisible, and the todo is simply somewhere else.
  - **Creating from a derived view navigates to the chosen list**, so you
    can see where the todo went. Creating something and being left looking
    at a view that may not contain it reads as a failure.
- **Selecting a list looks like selection, not hover.** *(added
  2026-08-01: the active row used a hover-ish fill that read as a stuck
  button.)* The active row is distinct from the hover state — carry it with
  weight, ink colour, or a leading marker rather than a slightly darker
  fill that hover then has to compete with.
- **The nav has a title** above its list of lists, so the panel is
  labelled rather than starting abruptly. *(added 2026-07-31.)*
- **The nav is collapsible on desktop too**, not only on mobile, and opens
  to the same comfortable width at both sizes — the desktop panel was
  noticeably narrower than the mobile drawer for no reason.
  *(added 2026-07-31.)*
- **Below 1280px, opening the detail panel collapses the nav.** *(added
  2026-08-03: with the detail panel now a third fixed-width column, the
  nav (20rem) and panel (24rem) together left `<main>` just 96px at a
  800px viewport and 396px at 1100px — the list became a sliver whenever a
  todo was open.)* The threshold is derived rather than chosen: `<main>`'s
  reading column is `--measure` (34rem) plus `--space-4` either side =
  576px, beyond which it gains no further reading width, so
  320 + 576 + 384 = **1280px** is the narrowest viewport where all three
  columns coexist without squeezing the list below its designed measure.
  Above it nothing changes; below it the nav yields, because it is the
  column that is one tap away.
  - **An auto-collapse is temporary and reverses; a manual collapse is
    permanent and is respected.** These are two different concepts and are
    kept as two: what the user *wants* (persisted under
    `fold:nav-pinned`) and what is *currently shown* (that preference,
    minus any auto-collapse). Closing the todo — or widening past the
    threshold — restores the nav **only if the user had not collapsed it
    themselves**.
  - **An auto-collapse never touches the stored preference.** It is a
    response to the current viewport, not a decision the user made, so it
    must not follow them to their next visit at a width where it would
    make no sense.
  - **While auto-collapsed, the ☰ opens the nav as the drawer** — the same
    overlay used on mobile — rather than re-expanding the pinned column.
    Re-expanding would take back the width the collapse just freed, which
    is the crush this rule exists to prevent: measured at 1024px with a
    todo open, forcing the column dropped the list to 320px, worse than the
    639px it had while collapsed. An overlay costs the list nothing, and
    the drawer closes on its own once the auto-collapse lifts.
    *(fixed 2026-08-03: the toggle re-expanded the column.)*
- **A newly created list appears in its final position immediately.**
  *(added 2026-07-31: new lists landed at the bottom, then jumped when the
  server's alphabetical order arrived.)* Sort the optimistic entry the same
  way the server will, so nothing moves once the response lands.
  *(strengthened 2026-08-03: the client now picks the new list's order
  itself, so there is no server ordering left to guess at — see
  [lists — a new list must not jump](./lists.md#a-new-list-must-not-jump).)*
- **Every list row carries a colour dot.** *(added 2026-08-03.)* An 8px dot
  sits before the name in every state, reusing the status-dot vocabulary
  rather than introducing a new visual concept.
  - **A list with no colour gets an unfilled ring** — a hairline circle, no
    fill — not a blank space. Every name then shares one left edge, the row
    rhythm is identical down the nav, and assigning a colour never shifts
    the row sideways. Omitting the dot would make an uncoloured list read as
    a different *kind* of row.
  - **The selected row's leading marker takes the list's colour** instead of
    `--accent`. The dot says which list a row is; the marker says which one
    you are in.
  - **A contrast guard protects the marker.** A colour too close to the
    current theme's paper would make the selected row read as unselected, so
    the marker falls back to `--accent` in that case. The dot always shows
    the true colour, and nothing stored is changed — see
    [lists — the contrast guard](./lists.md#the-contrast-guard).
- **Reordering is Move up / Move down in the kebab menu**, alongside Rename
  and Delete. *(added 2026-08-03: no drag-and-drop — buttons are keyboard
  accessible, work on touch without a long-press, and don't flake in e2e.)*
  Each is disabled at the end of the nav it cannot move past.

## Component library

*(added 2026-07-31: partial adoption left hand-rolled elements with
inconsistent behaviour and styling.)*

**Every interactive element comes from [Base UI](https://base-ui.com)** —
the `@base-ui/react` package. Not a subset: inputs, selects, dialogs,
drawers, checkboxes, fields, and forms all use its primitives, so focus
handling, keyboard behaviour and ARIA are consistent everywhere and are not
re-implemented per component.

*(clarified 2026-07-31: the mobile nav overlay and the todo detail sheet
use Base UI's `Dialog`, not `Drawer`. Base UI's own docs describe `Drawer`
as `Dialog` plus swipe-to-dismiss gestures, snap points and indent effects
— "a panel that slides in from the edge of the screen and doesn't need
gesture support is a positioned Dialog." Neither surface here needs swipe
gestures; both are already positioned with CSS exactly like the rest of the
app. Adopting `Drawer` would add unused surface area (swipe physics, snap
points, a virtual-keyboard provider) for no behavioural gain, so `Dialog`
is the correct choice per Base UI's own guidance, not a shortcut.)*

- Base UI ships no styles; all appearance comes from our CSS Modules and
  design tokens.
- The app root sets `isolation: isolate` so portalled popups stack
  correctly, and `body { position: relative }` for iOS Safari.
- Hand-rolling an element that Base UI provides is a defect, not a
  shortcut.

### The extension badge

*(added 2026-08-03.)*

A small `LuInfo` button marking a feature that relies on a CalDAV
**extension** rather than RFC 4791 — currently beside the colour field in
the list form ([lists](./lists.md)). It is generic: it takes its own text,
so a future extension-backed feature reuses it rather than growing a second
version. *(The reorder controls carry no badge: they live in a kebab menu,
where an info popover inside an open menu would fight the menu's own focus
and dismissal. The help modal covers ordering's extension instead.)*

**It is a Base UI `Popover`, not a `Tooltip` — deliberately, and this is an
accessibility decision rather than a stylistic one.**

- A **tooltip**'s content is an accessible *name* for its trigger: short,
  unfocusable, and not reliably reachable by assistive technology or the
  keyboard.
- A **popover** holds content the user is meant to read and navigate. It is
  focusable, dismissible with Escape, and properly announced.

This badge explains a concept in prose, so it must be the second. Base UI's
Popover supports `openOnHover`, so it still feels like a tooltip to a
pointer while behaving correctly for everyone else. Hover does not exist on
touch, so the trigger is a real `<button>` and a tap opens the same popover
— no part of it is pointer-only. A link, if ever wanted, goes *inside* the
popup, which is content a popover can hold and a tooltip cannot.

### The help modal

*(added 2026-08-03.)*

A `?` control sits beside Settings in the nav footer, opening a Base UI
`Dialog` styled exactly like the settings modal — same backdrop, popup and
animation treatment, under the overlay rules above. Like Settings it is
rendered as a **sibling** of the nav drawer rather than inside it, or Base
UI would suppress its backdrop on mobile.

Sections, all short: the derived views; todos; lists; colours and ordering;
working offline; and server extensions, which names `calendar-color` and
`calendar-order` and says what happens on a server that ignores them.

**The modal is deliberately a summary.** `docs/user/` remains the source of
truth for depth — see
[docs/user/colours-and-ordering.md](../user/colours-and-ordering.md).
Duplicating prose in two places guarantees one of them goes stale, so the
modal says what each thing is and how it behaves, and nothing more.

It is the only modal whose body genuinely scrolls, so initial focus goes to
the title rather than Base UI's default first tabbable element — which was
"Close" at the very bottom, and focusing it scrolled past the first section
before the user had read a word.

It closes from the header ✕ alone; that footer Close is gone *(changed
2026-08-03, issue #14 — see overlays)*. Initial focus stays on the title:
the ✕ no longer drags the body down, but landing on a dismiss control would
announce "Close" before the modal's own heading.

## Spacing & rhythm

Pixel-perfect alignment matters. All spacing comes from a **4px base scale**
— `4, 8, 12, 16, 24, 32, 48` — exposed as CSS custom properties. Nothing uses
an off-scale value.

- **One left edge.** *(added 2026-07-31: todo rows escaped the content
  column's padding, starting 488px left of the heading and quick-add.)*
  Every element in a column — heading, quick-add, todo rows, section
  headers, empty states — shares an identical left edge. Rows must not
  bleed past their container's padding, and no element may introduce its
  own horizontal inset that breaks the column.
  - **This includes controls, not just text.** *(reinforced 2026-07-31:
    the nav toggle sat at 9px, "Add a todo" at 16px, and the todo rows at
    a third value — three edges where there should be one.)* A button's
    *visible* leading edge is what must align, so an icon button with
    internal padding needs a negative inline offset to pull its glyph onto
    the shared edge rather than its box.
  - **Left and right edges both.** Rows in a panel — including the
    settings modal — align on both sides; no row carries extra horizontal
    padding that makes it narrower than its neighbours.
- **Inputs fit their container.** Fields, selects and textareas size to the
  available width (`width: 100%`, `box-sizing: border-box`, `min-width: 0`
  inside flex parents). Nothing overflows its panel or gets clipped by a
  scrollbar.
- **Vertical rhythm:** every row in a list occupies a consistent height
  regardless of its content. A todo with a description and one without must
  have **identical vertical alignment** for their titles and checkboxes; the
  description is an additional line within the row, never a nudge that
  misaligns its neighbours.
- Descriptions appear inline in the list when present, truncated to a single
  line. **There is no gap between a title and its description** — the
  description sits directly beneath, as though it were a wrapped line of
  the same block. *(tightened 2026-07-31: even a small gap made rows read
  as two separate things.)* The row's top and bottom padding are equal, so
  a row with a description stays balanced rather than top-heavy.
- Row heights are multiples of the base unit so lists form an even column.

## Typography

- System serif stack:
  `Charter, 'Bitstream Charter', 'Sitka Text', Cambria, Georgia, serif` —
  elegant, zero font-loading jank.
- **Small text, with hierarchy from weight and small size steps** — not from
  large jumps in size. The scale is deliberately tight:

| Token | Size | Weight | Use |
|---|---|---|---|
| `--text-xs` | 12px | 400–500 | metadata, counts, timestamps |
| `--text-sm` | 14px | 400 | secondary text, descriptions |
| `--text-base` | 15px | 400 | todo titles, body |
| `--text-md` | 16px | 500 | list title, section headers |
| `--text-lg` | 18px | 600 | screen title (login) |

- **Inputs are always ≥16px** regardless of the scale above — this prevents
  iOS auto-zoom on focus and is non-negotiable.
- 12px is permitted only for genuinely secondary metadata; nothing
  interactive or essential goes below 14px.

## Scrolling

*(added 2026-07-31: a long list scrolled the whole page, taking the list
title and its controls out of view.)*

**Only the list scrolls — never the whole page.** The title and any
controls beside it stay put, so you always know which list you're looking
at and can act on it without scrolling back up.

- The content column is a fixed-height flex layout: a **sticky header**
  (list title, nav trigger on mobile, any list-level controls) and a
  scrolling body beneath it.
- **"Add a todo" is a ghost row at the end of the list.** *(redesigned
  2026-08-01: as a standalone button above the list it never sat right —
  neither chrome nor content. Moved to the end the same day: adding is
  where the list continues, so the row belongs after the existing items,
  not before them.)* It mirrors a todo row exactly — same height, same
  checkbox column, same left edge — but reads as a placeholder rather
  than a real item:
  - The label is **italic and muted**, visibly distinct from real todos.
  - The **check circle is inert**: it is decorative, not a control, and
    tapping anywhere on the row (circle included) opens the add-todo modal.
    It must not be focusable or announced as a checkbox.
  - The whole row is one target, so there is no dead space between the
    circle and the label.
  - It sits with the list, scrolling with it — it is content, not a
    toolbar.
  - Because it is always the list's last row, **an empty list needs no
    empty-state copy** — the row already reads as an invitation to add
    something. *(added 2026-08-01: a "Nothing to do" message beneath it
    only repeated what the row says.)*
- **The scrollbar sits at the pane's edge, not mid-view.** *(added
  2026-07-31: with many items the scrollbar appeared inset in the middle of
  the viewport.)* The scrolling element must span the full pane width, with
  the reading measure constrained by padding *inside* it — not by narrowing
  the scroller itself.
- The same applies inside the nav: its list of lists scrolls while the
  footer (Settings, status) stays anchored.
- Scrollbar gutters still sit at the true container edge (see below).
- **A sticky header and the content scrolling beneath it keep one left
  edge, whether or not a scrollbar is present.** *(added 2026-08-01: once a
  list had enough items to scroll, the list shifted left to make room for
  the scrollbar while the sticky header above it didn't, so the title
  visibly stopped lining up with the rows.)* The header is a *sibling* of
  the scroller, not a child, so a scrollbar narrows only the scroller —
  their centred inner columns then centre in different widths. Fix both
  halves: hold the scroller's gutter open permanently (`scrollbar-gutter:
  stable`, so it doesn't appear and disappear as the list grows) **and**
  reserve the same width on the header, which as a non-scrolling element
  needs an explicit inline-end padding. The gutter width is platform
  dependent — real width with classic scrollbars, zero with overlay ones —
  so measure it once at startup and publish it as a custom property rather
  than hard-coding a guess.

### How much is in this view

*(added 2026-08-04.)*

Under the title, a muted line says what the view holds: **"12 todos · 5
done"**, or **"No todos"** when it is empty.

- **The headline counts what is left**, not the total. A number that never
  moves as work is finished is noise; one that falls when you tick
  something is feedback. The completed half only appears once there is
  some. When *everything* is done the count drops to just "6 done": "No
  todos" would erase the work, but "0 todos · 6 done" reads as a bug rather
  than a state, and the done count alone already says the view isn't
  empty.
- **Under the title, not beside it.** The title is centred by balancing the
  ☰ against an equal-width spacer, so a count of changing width alongside
  it would shift the title sideways every time a todo was ticked. It sits
  directly beneath with no gap — the two read as one unit rather than as
  two header rows.
- **It costs no request.** The line is derived from the todos the visible
  view has already loaded, read from the same query rather than a fetch of
  its own. A list view therefore stays a single-list fetch: the count must
  never be the reason the app fans out across every list, which is what
  keeps it free on a slow server (see issue #24).
- **A skeleton while unknown, words when empty.** Before the todos arrive
  the line shows a placeholder bar of exactly the text's height, never
  "No todos" — announcing an empty view and then contradicting it a moment
  later is worse than showing nothing legible. The line is always present
  so the list below it never shifts down when the count appears.
  - "Not loaded yet" and "loaded and empty" must be genuinely
    distinguishable. The signal is whether the pane that owns the query has
    put a response in the cache — an empty list settles with `todos: []`,
    which is different from having no entry at all. Query *status* flags
    are not a safe substitute here: the count observes the cache rather
    than owning a query, so flags like `isFetching`/`isSuccess` describe a
    request that never runs. *(added 2026-08-04, after three separate bugs
    from exactly that: a false "No todos" on every cold load, a real empty
    list showing no line, and a new list stuck on the skeleton.)*
  - The lists are the other half: on a cold load they arrive after first
    paint, so an empty list collection means "not loaded" as often as it
    means "none".

## The todo row

*(added 2026-08-09, issue #2.)*

A row is **the summary on its own line, with a meta line beneath it**:
which list, how urgent, when it is due. Those facts used to share the
summary's line and compete with it for width, so a long summary truncated
far earlier than the row needed. Giving the summary the full width and the
facts their own line fixes both — the summary still ellipses at one line,
deliberately, so row height stays predictable.

**One layout at every width.** Desktop has room to put the meta back beside
the title, but desktop width is the variable one — a pinned nav and an open
detail panel both eat into it — so a single layout is what keeps the row
recognisable. A row must not rearrange itself at a breakpoint.

**A row with nothing to say renders no meta line at all**, so an unadorned
todo keeps the height it would have had without this.

### Two pill treatments, split by who owns the colour

- **The list** is a hairline outline with its colour on an 8px dot. A
  list's colour is arbitrary — it can arrive from Apple Reminders or a hex
  field — and measured across the palette a tinted pill clears AA, but pure
  yellow, near-paper and neon green fall under 2:1 as text on their own
  tint. Confining the colour to a dot removes the problem rather than
  managing it with a render-time contrast guard: a dot has no legibility
  threshold, which is why the nav's has never needed one.
- **Priority and due dates** are soft fills in colours the app itself
  defines, so their contrast is known at build time.

The dot is drawn whatever the colour, including none (an empty ring). It is
the app's marker for *a list* — the same mark the nav uses — not merely a
swatch, so the pill says "list" before it says which one.

**The list pill appears only in derived views.** Inside a plain list every
row belongs to the list you are already looking at, so naming it on each
row would be noise.

### Icons, not colour alone

Overdue and high priority were both a red fill with red text, so a row
reading "high · Aug 2" showed one treatment twice for two unrelated facts.
A **clock** marks overdue (it is about time) and a **chevron** marks
priority rank. The two are now told apart by shape as well as hue, which
also makes them distinguishable to anyone who cannot separate the reds.

Low priority keeps the neutral fill: it is the *absence* of urgency, and
giving it a colour would make "not urgent" look like a claim. Its chevron
is what distinguishes it from an unprioritised todo.

## Overlays

*(added 2026-07-31: the delete-list confirm and the mobile sheet appeared
over an undimmed background, so they didn't read as modal.)*

### What stacks above what

*(added 2026-08-09: seven overlays hard-coded the same `z-index: 40`/`41`,
so two open at once were ordered by DOM position. The Move dialog opened
from the mobile edit sheet drew its scrim *underneath* that sheet — the
form behind it stayed undimmed, and the two read as one confused surface.)*

Overlays sit at one of two **levels**, set from the tokens in
`styles/tokens.css` and never as a literal:

| level | tokens | what sits here |
|---|---|---|
| base | `--z-overlay-base-scrim` / `--z-overlay-base` | opened from the page — the nav drawer, the mobile detail sheet |
| stacked | `--z-overlay-stacked-scrim` / `--z-overlay-stacked` | opened from *inside* another overlay — New todo, New list, Move, Edit list, Settings, Help, any confirm |

*(corrected 2026-08-11: this table listed the add-todo modal as base, and
the CSS matched it. But New todo is opened from the nav drawer — beside
New list, which stacks — and leaves it open, so base put its scrim on the
drawer's own layer: both landed on z-index 40, so instead of dimming the
drawer the modal shared its dimming, and the drawer's contents drew over
the popup. The rule below already said what should happen; only these two
disagreed.)*

Above both: `--z-popover` for a menu or select launched from within an
overlay, and `--z-float` for the status pill and toasts, which report on
work an overlay may have started and so must clear it.

**A stacked overlay dims what it covers, including the overlay beneath.**
That is the whole point of the second level: its scrim sits directly below
its own popup and above everything else, so the surface it interrupts
visibly recedes.

**A modal never closes the surface it was opened from.** Opening Settings
from the nav leaves the drawer open behind it; dismissing Settings returns
you to the nav, where you were. This was inconsistent for a while —
Settings, Help and the global add closed the drawer first while Edit list
(opened from the same drawer) stacked over it — and the closing version is
worse: dismissing the modal dropped you somewhere you had never navigated
to. *Choosing a list* is the exception, and is not a modal at all: it
changes what is behind the drawer, so the drawer has done its job and
closes (`openOverDrawer`).

A third level is deliberately not defined. No flow in the app is three
overlays deep; add one when a flow needs it rather than reserving numbers
now.

- **Every overlay dims the background** — nav drawer, bottom sheet, confirm
  dialogs, the add-todo modal, settings. Without exception: a modal surface
  over undimmed content reads as a rendering glitch. *(changed 2026-08-03,
  issue #4: "side panel" was in this list. The desktop detail panel is no
  longer an overlay at all — it is a layout column (see Layout above), so
  it has nothing to dim and is outside this rule. The rule is unchanged for
  everything that is still an overlay, including the mobile detail sheet.
  What makes a surface subject to it is being modal, not being a panel.)*
  - **A modal must never be rendered inside another dialog's subtree**, even
    when the control that opens it lives there. Base UI deliberately
    suppresses a *nested* dialog's backdrop, and with no backdrop there is
    also nothing to click to dismiss — so such a modal silently loses both
    its scrim and click-outside-to-close. Keep the trigger and the open
    state where they belong, and render the modal itself as a sibling of the
    outer dialog. *(added 2026-08-01: Settings is opened from the nav
    footer, which on mobile renders inside the drawer's dialog, so on mobile
    only it came up undimmed and couldn't be dismissed by tapping away.
    Opening it also closes the drawer — otherwise two overlays would stack
    their scrims and focus traps.)*
    *(recurred 2026-08-04, issue #20: the New list / Edit list modals and
    the delete-list confirm were still owned by `ListNav`, which is exactly
    such a subtree on mobile. This rule applies to **every** modal opened
    from the nav, not only the ones in the footer — when adding one, put it
    with Settings and Help rather than beside its trigger.)*
  - **A modal's state must outlive a layout change.** Anything rendered
    conditionally on viewport width unmounts when the breakpoint is crossed,
    taking its form state with it. A resize is not a dismissal: a half-typed
    list or a part-written edit must survive one, so that state belongs in a
    component mounted at every viewport (`MainScreen`), not in whichever
    surface happens to be showing. Closing a modal still discards the draft —
    that *is* a dismissal. *(added 2026-08-04, issue #21: the New list modal
    vanished outright on a resize, losing the name and colour already
    entered. Same shape as the todo detail panel, fixed a day earlier — see
    `todos/use-todo-detail-form.ts` and `lists/use-list-form.ts`.)*
- **An icon-only button is named by a tooltip** — and by `aria-label` on
  the button itself, never only by the tooltip: hover doesn't exist on
  touch, and assistive tech must not depend on a hover-triggered element to
  learn what a control does. It keeps the same hit area and height as a
  labelled button beside it, so only the width changes.
  - **This is the case tooltips are for.** A tooltip's content is an
    accessible *name* for its trigger. Prose the user is meant to read
    needs a popover instead — focusable, escapable, announced (see
    `info-badge.tsx`, and the same distinction in the overlays section).
  - Reserve it for actions a single familiar glyph carries completely. A
    row of unlabelled icons is a guessing game.
  *(added 2026-08-04. The rule stands; the component does not. Its one
  instance was Duplicate, which moved out of the detail panel's actions row
  later the same day — being the only unlabelled control in a row of
  labelled ones is exactly the "guessing game" this warns about
  ([todos](./todos.md) — duplicating a todo). `icon-button.tsx` was then
  carried for two days with no caller, and **was deleted 2026-08-06** once
  knip surfaced it. It is in history at `03cf4a9` if an icon-only action
  ever earns its place — the reasoning above is the part worth keeping,
  not the unused code.)*
- **Warning is its own button role**, distinct from destructive: an action
  that is permitted but should give pause, like unlocking a completed todo
  for editing. Amber (`--status-syncing`), matching the notice it answers.
  Red stays reserved for actions that actually destroy something, or it
  stops meaning anything. *(added 2026-08-04, issue #25.)*
- **A disabled control must look disabled.** Muted ink, a faintly tinted
  ground, and a `not-allowed` cursor — a read-only field that is
  pixel-identical to an editable one reads as broken, and you only discover
  the difference by clicking and having nothing happen. This lives once, on
  the element selectors in `global.css`, so every form gets it. A select
  trigger is a *button* rather than an input, so it needs the rule stated
  for it explicitly; the same is true of anything else that styles its own
  control surface. *(added 2026-08-04, issue #25: the todo panel's
  read-only state was invisible.)*
  - **Say why, not just that.** Where a control is disabled for a reason
    the user could act on, the surface states it — the todo panel's
    "Completed" notice and its popover, rather than leaving a wall of inert
    fields to be puzzled over.
- **A divider separates a title from its content** in modals and side
  panels, so the heading reads as a header — especially once the body
  scrolls beneath it. *(added 2026-07-31.)* This is for the *title*
  boundary only: don't scatter dividers between fields (the add-todo modal
  had one between the summary field and the Advanced accordion, which just
  fragmented the form).
  - **The divider spans the full width of the surface**, edge to edge, with
    no horizontal inset. *(added 2026-08-01: the create/rename/delete-list
    modals inset theirs, so it read as a stray line rather than a
    structural boundary. Every modal's divider must look identical.)*
- **Modal padding is uniform on all four edges** and modest — matched to
  the gap between action buttons, so the surface feels of a piece rather
  than roomy on one side. *(added 2026-08-01.)*
- **A modal closes from a ✕ in its header**, at the trailing edge opposite
  the title — that is where people reach first, before hunting for a button
  in a footer. *(added 2026-08-03, issue #14.)* Escape and a click outside
  still work; the ✕ is an addition, not a replacement.
  - **One shared header, not one per modal.** The title row, its divider,
    its padding and the ✕ live in a single component
    (`apps/client/src/ui/modal-header.tsx`). Five modals previously each
    carried a near-identical `.title` rule, which is how they drifted apart
    and needed the same padding and divider fixes applied five times.
    - The header is also used by the **desktop detail column**, which is
      not a dialog and so cannot render Base UI's `Dialog.Title`/
      `Dialog.Close`. Callers may substitute those two *elements*; the
      padding, divider and ✕ styling — the reason the component exists —
      stay owned by it. A `render` escape hatch rather than an `isDialog`
      boolean, which would only have invited a second boolean next time.
      A ✕ still closes the column: it is no longer modal, but a ✕ is still
      the right control to dismiss the panel. *(added 2026-08-03,
      issue #4.)*
  - **The ✕ is quiet.** `--faint` at rest, darkening to `--ink` on hover,
    so it never competes with the title beside it. The glyph is small but
    its button is a full `--hit-area` box — never size the target to the
    glyph (see controls & touch targets below).
  - **The confirm dialog is the exception — it gets no ✕.** A destructive
    confirm asks a question and offers two explicit answers; a third
    dismissal path in the header would compete with its Cancel.
  - **One close control per surface.** The todo panel's footer carried a
    "Close" beside the header's ✕, which was two controls for one action.
    That button is now **Reset** — discard the edit and restore the stored
    values — which had no control at all before: undoing an edit meant
    closing the panel and reopening it. It is disabled when the form is
    clean, the same rule Save follows. *(changed 2026-08-04.)*
  - **A surface's status belongs in its header**, not beside its buttons.
    The todo panel's "Unsaved changes" sat in the actions row, which is the
    panel's widest and most variable strip: right-aligned there, it drifted
    into the middle of a wide panel — far from anything it referred to —
    and wrapped on a narrow one. The header is a fixed row at a fixed
    height, so the note stays put at every width, and stays visible when a
    long todo scrolls the actions out of view. *(moved 2026-08-04.)*
  - **A modal does not carry both a ✕ and a footer Close.** Two close
    controls in one modal is one too many. The help modal's footer Close
    was removed when the ✕ arrived — it sat below the scroll viewport, so
    it could only be found by scrolling the whole modal, which is what
    prompted the ✕ in the first place.
- **Spacing between form controls is uniform.** One gap value between every
  field, accordion trigger and control in a form; and the gap between the
  modal title and the first field matches it. *(added 2026-08-01: the
  add-todo modal had a large gap before the Advanced accordion and a
  cramped one under the title.)*
- **Overlays animate in and out.** Sheets and drawers slide from their
  edge; modals fade with a slight rise. The scrim fades with them. All of
  it is disabled under `prefers-reduced-motion`.
- **The desktop nav animates too.** *(added 2026-08-01: collapsing it on
  desktop snapped instantly while the mobile drawer slid.)* Collapsing and
  expanding the pinned sidebar uses the same duration and easing as the
  mobile drawer, so the two read as one behaviour at different sizes.

## Controls & touch targets

- **Touch-first, pointer-aware.** *(refined 2026-07-31: a uniform 44px
  made desktop controls look thick and unrefined.)* The hit area adapts to
  the input device:
  - **Coarse pointers (touch): 44×44px minimum**, non-negotiable — this is
    a usability floor, not a style choice.
  - **Fine pointers (mouse): may be smaller** (~32–36px), since a cursor
    is precise. Desktop should read as tight and elegant.

  Express this with one pointer-aware token (`@media (pointer: coarse)`),
  never by hard-coding two sizes per component.
- **Controls are always visible, never hover-revealed.** *(added
  2026-07-31.)* Hover may refine an appearance, but a control that only
  exists on hover is undiscoverable on touch and invisible to anyone
  scanning the page. Applies to per-row menus in particular.
  *(superseded 2026-07-31: an earlier pass considered and rejected a
  segmented "name | menu" button here, on the grounds that the divider was
  chrome the rest of the row didn't have. The owner has since asked for
  segmenting explicitly — see "The nav" above, where the row is now a
  true segmented button. The kebab itself is unchanged by that: still
  visible (not hover-gated) at rest, darkening on hover/focus.)*
- **Checkboxes are small** — a ~20px visual circle inside a 44px target.
  Icons sit optically with adjacent text rather than towering over it.
- Icons come from a **single [react-icons](https://github.com/react-icons/react-icons)
  set**, sized in step with the text they accompany. No emoji.
- **Icon and label are left-aligned together** — icon first, then the
  label, separated by a single gap from the spacing scale. The pair sits at
  the leading edge; remaining width is empty space on the right.
  *(reverted 2026-07-31: pushing the label to the trailing edge left a
  distracting void mid-button and made rows read as unrelated fragments.)*
- **Buttons of the same kind look the same.** A full-width nav action —
  Settings, New list — shares one treatment; none is a special case.
  *(clarified 2026-07-31: applies to full-width action-style rows where the
  gap has room to read clearly — the nav footer's Settings row is the
  reference case. Small, non-full-width controls keep a tight icon-text
  pairing instead, since space-between has no width to distribute and
  would just look like an arbitrary gap: the sound Toggle in Settings, the
  kebab's Rename/Delete menu items, and disclosure triggers (the "Advanced"
  accordion, "Completed (N)") where the chevron is a state indicator glued
  to its label, not a leading icon.)*

*(added 2026-07-31, from design review:)*

- **Hover is a whisper, not a change of state.** *(added 2026-08-01: row
  and button hovers swapped whole background fills, which read as the
  element becoming something else.)* The reference is the primary button's
  `filter: brightness()` — enough to acknowledge the pointer, not enough
  to redraw the control. Nothing should gain or lose a fill on hover where
  a slight shift in the existing one will do.
- **Hover transitions are short** — a brief ease on the colour, so the
  change lands rather than snapping.
- **Buttons carry a very slight shadow**, like paper on paper: barely
  perceptible depth, never a drop-shadow that lifts them off the page.

- **Focus is shown by changing the border *colour* only.** An outline draws
  outside the element's box and gets clipped by sheet and sidebar edges;
  changing the border *width* reflows the element. Border width is
  constant — only the colour changes. Focus must remain clearly visible;
  this changes how, not whether. *(clarified 2026-07-31: the first
  implementation widened the border on focus, causing a 1px layout shift.)*
- **A control with an open popup shows the same accent border**, whether or
  not it also has visible focus. A select trigger is a button styled to look
  like an input, so it gets an input's treatment — and an open dropdown is
  an active control. Opening by pointer gives the trigger focus but not
  `:focus-visible`, so the open state must be styled in its own right rather
  than relying on the focus rule to cover it. *(added 2026-08-03, issue #18:
  the Priority and List triggers kept their resting `--line` border while
  their popup was plainly open, so the control that opened it looked
  untouched.)*
- **Corner radii are small.** Restrained rounding suits the typography;
  large radii read as soft and generic.
- **No press-transform anywhere.** *(broadened 2026-07-31: this applied
  only to list rows; it applies to every element.)* Nothing scales or
  shifts on `:active`. **Motion belongs to elements that are moving** —
  entering, leaving, expanding, sliding in — not to acknowledging a press,
  where it distracts without informing. Deliberate micro-interactions like
  the checkbox stroke draw stay.
- **Scrollbar gutters sit at the container edge.** Padding belongs inside
  the scrolling content, so the scrollbar tracks the true edge of the pane
  rather than floating inset from it.

*(added 2026-07-31, from design review: buttons had no surface, no border —
just bare text on the page background, easy to mistake for inert labels.)*

- **Action buttons have real chrome** — a surface background, a hairline
  border, and the same small radius as everything else. Bare-text buttons
  read as inactive labels, not controls. Three roles, used consistently
  everywhere a button appears (todo detail, add-todo modal, confirm dialog,
  settings, list create/rename, login):
  - **Primary** — the affirmative action (Save, Add, Create, Sign in): solid
    accent surface.
  - **Default** — secondary actions (Close, Cancel): the same neutral
    surface/border as primary, quieter ink.
  - **Destructive** — Delete and the confirm dialog's destructive action:
    danger-coloured border and ink, filling solid on hover.
  - The mechanism is one shared CSS Module
    (`styles/button.module.css`) that every button-bearing module
    `composes:` from, so the three roles can't silently drift apart between
    components.
- **Icon-only and nav-item controls stay chromeless** — the drawer trigger,
  the mute toggle, list rows, the per-list rename/delete icons, and the
  completed-section disclosure trigger are not "actions" in the sense above
  and keep their existing quiet styling. *(clarified 2026-07-31: the list
  row's segmented outer shape — see "The nav" above — is a hairline border
  around the row as a whole, not button chrome on the name or kebab
  individually; neither segment gains a surface, radius, or hover fill of
  its own beyond what it already had.)*

## Status display

*(revised 2026-07-31: squeezing the status into the nav footer truncated it
to "Server unre…", making the one state the user most needs to understand
unreadable.)*

*(revised again 2026-07-31: a transient upstream failure made the pill
announce "Server unreachable" for a second and vanish. A momentary blip is
not worth a sentence of text — the sync layer is already handling it by
queueing and retrying.)*

**Server reachability lives in the nav footer** as a dot plus a short
label. *(revised 2026-07-31: the dot alone was ambiguous; now that the
underlying flapping is fixed, a word of text is affordable and clearer.)*

| State | Dot | Label |
|---|---|---|
| Healthy | **green**, static | `Synced` |
| Working — syncing or queued | **amber**, static | `Syncing…` |
| Disconnected — offline or unreachable | **red**, gently pulsing | `Offline` / `Disconnected` |

- Colour is semantic: green = success, amber = in progress, red = broken.
- Only the disconnected state pulses; healthy and in-progress are static so
  the footer stays quiet. The pulse stops under `prefers-reduced-motion`.
- The label is real text, so state never depends on colour alone; it also
  carries an accessible label for assistive tech.
- The status line aligns with the nav's rows, matching Settings above it.

**Text is reserved for states the user must act on or wait through:**

- **Offline** — `Offline · N queued`
- **Queued work that cannot proceed** — e.g. `Sign in to save N changes`
- **Syncing** — `Syncing N changes`

These appear in a **fixed pill at the bottom of the viewport**, centred,
above the content, showing the full untruncated message. The pill persists
while the condition lasts and disappears by itself once resolved; it never
traps focus or blocks interaction.

A brief upstream failure while work is queued therefore turns the dot red
and leaves the pill saying `Syncing N changes` — which remains true, since
the outbox retries regardless. Transient toasts (a dropped mutation, a
storage failure) stay separate and still auto-dismiss.

## Palette

Paper-white background, near-black ink, one accent colour. Light/dark via
`prefers-color-scheme`. Generous whitespace; restrained chrome — the todos
are the interface.

## Keyboard shortcuts

*(added 2026-08-04, issue #5.)*

| Chord | Does |
|---|---|
| `Ctrl+K` | New todo |
| `Ctrl+Shift+N` | New list |
| `Ctrl+Shift+1` | Go to Today |
| `Ctrl+Shift+2` | Go to Summary |
| `Ctrl+/` | Open Help |

**`Ctrl` on every platform, including macOS.** The conventional advice is
Cmd on a Mac and Ctrl elsewhere, and this did that until 2026-08-04. Two
things argued it down: the chords worth having kept colliding — `Cmd+N` is
the browser's, and `Cmd`/`Ctrl` + a digit is taken twice over on macOS, by
the OS for Spaces and again by the browser for tabs — and one family means
no platform branch in the binding, none in the label, and a chord you can
say out loud. The cost is deliberate: Ctrl is not the native modifier on
macOS. Fold is personal software written for someone who lives in vim
(README — personal software). `metaKey` is not accepted as an alternative;
that would reintroduce exactly the collisions this escapes.

**`K`, not `N`, for New todo.** `Cmd+N` is reserved by the *browser*: it
opens a new window and the keydown never reaches the page, so there is
nothing for `preventDefault()` to cancel — a binding that cannot be made to
work rather than one implemented wrongly. Moving to Ctrl freed `N` again,
but K stays: it is the near-universal quick-action key (Linear, Slack,
Notion, GitHub) and is where the command palette is headed (issue #26), so
binding it now means the palette inherits the muscle memory rather than
asking for it back.

**Digits carry Shift.** `Ctrl+1` never arrives on macOS. `Ctrl+Shift+1`
does.

**`Ctrl+Shift+<n>` is the nth derived view**, numbered in nav order and
generated from `DERIVED_VIEWS` (todos/today.ts) — so adding a view gives
it a chord, a nav row and a help-modal entry without touching the map.
**Real lists deliberately get none.** They are created and deleted freely,
so a positional chord would change meaning under the user; they are
reachable by name from the command palette instead (issue #26). Derived
views are a small fixed set that only changes when someone decides to add
one, so a position there is a decision rather than an accident.
*(added 2026-08-04.)*

- **One app-level listener owns the whole map** (`use-shortcuts.ts`), not
  handlers scattered across components. The map is a single thing the user
  learns and the help modal documents, so it is a single thing in the code:
  otherwise no one place answers "what does this chord do here", and two
  components can silently claim the same one. The matching rules are pure
  functions in `shortcuts.ts`, tested without a DOM.
- **Bindings are matched on `event.code`, not `event.key`.** `key` reports
  what a key *produces* once modifiers apply — Shift+1 is `"!"` — so a
  digit binding matched on `key` would silently never fire. `code` is the
  physical key, whatever the modifiers or the layout do to it.
  *(changed 2026-08-04.)*
- **A shortcut stands down while a modal is open**, rather than stacking a
  second surface on what you are already doing. The detail panel is
  deliberately *not* in that set: it is a layout column on desktop, not a
  modal, and treating it as blocking made the chords dead for most of a
  session. An unsaved edit there is protected by the rule that already
  matters — a shortcut never fires while a field has focus — and the
  panel's state outlives a modal opening over it.
  *(changed 2026-08-04: the open detail panel used to block.)*
- **New todo needs a list to exist**, since its form asks which one to use
  (issue #15). It works from Today and Summary; it stands down only when
  there are no lists at all.
- **A bound chord is always consumed**, even when the action is
  unavailable. Letting it fall through to the browser only when a modal
  happens to be open would be worse than either consistent behaviour.
- **Never steal a keystroke from a field.** Anything typed into an input,
  textarea, select or `contenteditable` belongs to that field.
- **The modal is titled "Help", not "About Fold"** — it is entirely
  how-to, and "About" promises provenance (version, licence) that isn't
  there. *(renamed 2026-08-04.)*
- **The map is listed in the help modal, first**, rendered *from* the same
  constant that binds it — a shortcut nobody knows about may as well not
  exist, and documentation maintained by hand drifts silently. It leads the
  modal because `Ctrl+/` opens it and someone arriving that way is here for
  the map. Just the list: the rules above are true but describe behaviour
  you never notice working, and they pushed the list below the fold.
  *(changed 2026-08-04.)*
- **The nav prints each row's chord, but only on demand.** Five permanent
  keycaps is a lot of chrome on a page built on restraint, and a hint you
  have learned is noise. They appear on hover, or when Ctrl is held for
  400ms — long enough to distinguish "holding Ctrl to ask" from "reaching
  for a chord I know", so ordinary use never makes the nav strobe. Hidden
  entirely while a field has focus, since the shortcuts do not fire there
  either, and removed altogether on touch devices
  (`hover: hover and pointer: fine`), which have no Ctrl to hold.
  *(added 2026-08-04.)*
- **`Ctrl+F` is deliberately unbound.** It was in the original issue, but it
  depends on the search view (issue #6) and overriding the browser's own
  find is a real cost: taking it away before there is something better to
  put in its place is a straight loss.

## Accessibility

- **Keyboard-first.** Logical tab order, visible focus rings, no keyboard
  traps. Drawer and sheet manage focus: move into the surface on open,
  restore to the trigger on close.
- **Every interactive element has a clearly visible focus state — including
  destructive ones.** *(added 2026-07-31: Delete buttons and menu items had
  no distinct keyboard-focus appearance, which is worst precisely where a
  mistaken Enter is least recoverable.)* Destructive controls must be at
  least as legible when focused as any other, not less.
- **Focus never lands somewhere misleading after an action.**
  *(added 2026-07-31: submitting the add-todo form moved focus onto the
  first row in the list, which then appeared selected and active.)* After
  completing an action, focus returns to a sensible resting place — the
  control that started it, or the surface that remains — never onto an
  unrelated item that reads as selected.
- Accessible primitives come from **Base UI** (unstyled, no runtime styling),
  so a11y behaviour is correct without dictating visual design.
- Status changes are announced politely; destructive actions are confirmed.

## Micro-interactions

All gated behind `prefers-reduced-motion`:

- Animated checkbox: SVG stroke draw on check.
- Strikethrough sweep, then a gentle settle into the completed section.
- Item enter/exit transitions on add/delete.
- Subtle press feedback on buttons; smooth collapse of the completed section.

## Sound

*(revised 2026-07-31: the completion sound stopped playing. Two causes —
a cached `AudioContext` created outside a user gesture stays suspended
forever, and the play path was gated on `prefers-reduced-motion`.)*

- **Resume the `AudioContext` before playing.** Browsers create it
  suspended until a user gesture; a cached suspended context is silent for
  the rest of the session. Resume on each play, or create it lazily inside
  the gesture that triggers the sound.
- **Reduced motion must not silence audio.** It is a vestibular
  preference about movement, not sound. The mute toggle is how a user
  turns sound off.

## Sound (stretch)

- Short synthesized "pop" via Web Audio API on completion — no audio assets.
- On by default; mute toggle in the header persisted to localStorage.
- Never plays when `prefers-reduced-motion` is set.

## Forms

All forms (login, todo detail, list create/rename) use react-hook-form with
`@hookform/resolvers/zod`, reusing `packages/schemas` so one schema drives
both validation and types.

### Date and time inputs

*(added 2026-08-08: on iOS the two due fields could not be made narrower
than their own content, and pushed the detail sheet into a horizontal
scroll on an iPhone 17 Pro.)*

WebKit gives `<input type="date">` and `type="time"` an **intrinsic width**
derived from their shadow DOM and treats it as a floor. `width: 100%` is
honoured only down to that size, and `min-width` can never lower a floor —
it only ever raises one. So a layout rule asking these fields to shrink was
not being ignored; it was being overruled.

`-webkit-appearance: none`, plus `min-width: 0` on the field and on
`::-webkit-date-and-time-value`, removes the intrinsic sizing so the
element sizes like any other input (`styles/global.css`). The native picker
is unaffected — tapping still opens the platform wheel; only the *box*
stops being self-sized.

**Reach for this before a breakpoint.** The earlier fix wrapped the row and
set a `9rem` minimum, which accommodated the floor rather than removing it
and still overflowed on a narrow sheet. A media query would have been a
guess at a width that is really about the platform's control, not the
viewport.

## Destructive actions

Delete list and clear completed require explicit confirmation.
