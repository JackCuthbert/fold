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
  completed in a collapsible section with a count and "Clear completed"
  (confirm required).
- **Detail view:** tapping a todo opens a **bottom sheet on mobile** and a
  **side panel on desktop** — never an inline expansion that shifts the list.
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
- **The "Lists" heading is compact** — it labels the panel, so it should
  not claim as much vertical space as the rows beneath it.
  *(added 2026-08-01.)*
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
- **A newly created list appears in its final position immediately.**
  *(added 2026-07-31: new lists landed at the bottom, then jumped when the
  server's alphabetical order arrived.)* Sort the optimistic entry the same
  way the server will, so nothing moves once the response lands.

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
- **The scrollbar sits at the pane's edge, not mid-view.** *(added
  2026-07-31: with many items the scrollbar appeared inset in the middle of
  the viewport.)* The scrolling element must span the full pane width, with
  the reading measure constrained by padding *inside* it — not by narrowing
  the scroller itself.
- The same applies inside the nav: its list of lists scrolls while the
  footer (Settings, status) stays anchored.
- Scrollbar gutters still sit at the true container edge (see below).

## Overlays

*(added 2026-07-31: the delete-list confirm and the mobile sheet appeared
over an undimmed background, so they didn't read as modal.)*

- **Every overlay dims the background** — nav drawer, bottom sheet, side
  panel, confirm dialogs, the add-todo modal, settings. Without exception:
  a modal surface over undimmed content reads as a rendering glitch.
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

## Destructive actions

Delete list and clear completed require explicit confirmation.
