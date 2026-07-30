# UI & Visual Design

Minimalist, elegant, fast. Mobile + desktop from one responsive layout.

## Views

- **Desktop (≥768px):** persistent sidebar of lists ([lists](./lists.md)) +
  main todo pane.
- **Mobile:** list switcher in a drawer/sheet; single-pane todo view.
- **Todo pane:** quick-add input at top; active todos sorted per
  [todos](./todos.md); detail view (mobile: sheet; desktop: inline panel)
  for editing.
- **Completed:** collapsible section per list with count + "Clear completed"
  (confirm required).
- **Header:** current list name, offline / server-unreachable pill with
  queued-changes count ([sync-and-offline](./sync-and-offline.md)), sound
  mute toggle.
- **Login screen:** ([authentication](./authentication.md)) server URL,
  username, password via react-hook-form.

## Typography & palette

- System serif stack:
  `Charter, 'Bitstream Charter', 'Sitka Text', Cambria, Georgia, serif` —
  elegant, zero font-loading jank.
- **14px minimum** text anywhere; **all inputs 16px** (prevents iOS
  auto-zoom).
- Paper-white background, near-black ink, one accent color. Light/dark via
  `prefers-color-scheme`.
- Generous whitespace; restrained chrome — the todos are the interface.

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
