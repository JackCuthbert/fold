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
- **No top menu bar.** Chrome is minimal: the list title sits with the
  content, not in a separate bar competing for attention.
- **Main content is centred** with a comfortable measure (max ~34rem) so it
  reads well at any window width.
- **Todo pane:** quick-add at top; active todos per [todos](./todos.md);
  completed in a collapsible section with a count and "Clear completed"
  (confirm required).
- **Detail view:** tapping a todo opens a **bottom sheet on mobile** and a
  **side panel on desktop** — never an inline expansion that shifts the list.
- **Login** ([authentication](./authentication.md)): server URL, username,
  password via react-hook-form.

## Spacing & rhythm

Pixel-perfect alignment matters. All spacing comes from a **4px base scale**
— `4, 8, 12, 16, 24, 32, 48` — exposed as CSS custom properties. Nothing uses
an off-scale value.

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

Sync status is **peripheral, not prominent** — a quiet indicator in a corner,
not a banner. A small **status dot** conveys state by colour:

| State | Dot | Detail |
|---|---|---|
| Synced | none / muted | no queued work |
| Syncing | accent | pending count on hover/focus or via `aria-label` |
| Offline | amber | queued count available to assistive tech |
| Server unreachable | amber | distinct label, same visual weight |

It must remain announced to screen readers ([accessibility](#accessibility))
even though it is visually subtle.

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
