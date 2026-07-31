# UI & Visual Design

Minimalist, elegant, fast. **Mobile-first** — the phone layout is the design,
and it scales up to desktop rather than the reverse.

*(rewritten 2026-07-31 after design review: the original was a desktop layout
with a mobile fallback, used an ad-hoc type scale, and put sync status front
and centre.)*

## Layout

- **Left nav, collapsible, hidden by default.** It holds lists and
  configuration ([lists](./lists.md)) — not primary content. On desktop
  (≥768px) it may stay pinned open; on mobile it overlays with a scrim.
  Dismissible by Escape, scrim tap, or selecting a list.
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
- **Login** ([authentication](./authentication.md)): server URL, username,
  password via react-hook-form.

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
  line.
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

## Controls & touch targets

- **Touch-first.** Every interactive element has a **minimum 44×44px hit
  area**, even where the visible control is smaller. Hover is an
  enhancement, never the only way to reveal a control (see
  `@media (hover: none)`).
- **Checkboxes are small** — a ~20px visual circle inside a 44px target.
  Icons sit optically with adjacent text rather than towering over it.
- Icons come from a **single [react-icons](https://github.com/react-icons/react-icons)
  set**, sized in step with the text they accompany. No emoji.

## Status display

*(revised 2026-07-31: squeezing the status into the nav footer truncated it
to "Server unre…", making the one state the user most needs to understand
unreadable.)*

Status has two distinct presentations:

**Healthy — a quiet dot.** When everything is synced, a small muted dot in
the nav footer. No text, no chrome.

**Degraded — a persistent pill.** When offline, the server is unreachable,
or work is queued, a **fixed pill at the bottom of the viewport**, centred,
above the content. It:

- shows the **full message, never truncated** — it sits in the viewport, not
  in a narrow column, so it has room
- **persists** while the condition lasts (it is a state indicator, not a
  transient toast) and disappears by itself once resolved
- states the condition and the queued count, e.g.
  `Server unreachable · 3 queued`
- is announced to assistive tech, and never traps focus or blocks
  interaction — the app stays usable while degraded

Transient toasts (a dropped mutation, a storage failure) remain separate and
still auto-dismiss; the status pill is not a toast.

## Palette

Paper-white background, near-black ink, one accent colour. Light/dark via
`prefers-color-scheme`. Generous whitespace; restrained chrome — the todos
are the interface.

## Accessibility

- **Keyboard-first.** Logical tab order, visible focus rings, no keyboard
  traps. Drawer and sheet manage focus: move into the surface on open,
  restore to the trigger on close.
- Accessible primitives come from **Base UI** (unstyled, no runtime styling),
  so a11y behaviour is correct without dictating visual design.
- Status changes are announced politely; destructive actions are confirmed.

## Micro-interactions

All gated behind `prefers-reduced-motion`:

- Animated checkbox: SVG stroke draw on check.
- Strikethrough sweep, then a gentle settle into the completed section.
- Item enter/exit transitions on add/delete.
- Subtle press feedback on buttons; smooth collapse of the completed section.

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
