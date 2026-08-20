# The command palette

*(added 2026-08-20, issue #26.)*

`Ctrl+K` opens one field that reaches every action in the app: create a
todo or a list, jump to any view or any list by name, open Settings or
Help, sign out. Type to filter, arrow to choose, Enter to run.

## Why

**One entry point instead of nine.** Every action the palette offers is
already reachable — by a chord, a nav button, or a gear buried in a modal.
What it removes is having to remember *which*. The value is not new
capability, it is one thing to reach for.

That claim is worth being honest about, because it bounds the feature:
**the palette adds exactly one capability that did not exist, which is
jumping to a list by name.** Lists are user data, so they can never have
keyboard chords — a list created this afternoon cannot have been assigned
one. Everything else in the inventory is a second path to something that
already has a first.

A palette worth having is therefore not one that does *more*, but one that
does the same things from one place, quickly, without the mouse.

## What is in it

Nine kinds of action. The list is deliberately closed — see
[what is deliberately not in it](#what-is-deliberately-not-in-it).

| Group | Command | Has a chord? |
|---|---|---|
| Create | New todo | `N` |
| Create | New list | `Ctrl+Shift+N` |
| Go to view | Today, Tomorrow, Next 7 days, Summary, Search | `Ctrl+Shift+1`–`5` |
| Go to list | *each list, by name* | no |
| App | Settings | no |
| App | Help | `Ctrl+/` |

**Views and lists are separate groups**, not one "Go to". They are
different kinds of destination: the views are fixed, chorded and identical
in every install, while the lists are the user's own data — renamed,
reordered and deleted at will. Under one heading a nav's worth of list
names read as more views. *(split 2026-08-20, on review.)*

**A list wears its own colour dot**, the same mark the nav gives it
([lists](./lists.md) — colours), rather than a generic icon. The palette is
a second route to the same place, so a list should not look like a
different kind of thing in it. *(added 2026-08-20, on review.)*

**Lists are generated at runtime**, from the lists themselves rather than
from a hand-written entry per list. Creating a list adds it to the palette
with no code change, and renaming one renames it here.

### What is deliberately not in it

**Per-todo actions** — complete, schedule, prioritise, move, delete *this*
todo. The row's own context menu already does all of them, in place, with
the todo in front of you ([todos](./todos.md) — row actions). For the
palette to offer them it would have to know which todo you mean, which is
a selection model it does not otherwise need: state to hold, keep correct
across navigation, and explain. The context menu answers the same question
with the answer already on screen.

**Searching todos.** [Search](./search-view.md) is a view of its own
(issue #6) with fuzzy matching over summary and description. The palette
gets you *to* it — `Ctrl+K`, "search", Enter — and does not reimplement it.
A palette that finds actions but not todos is a coherent thing as long as
finding todos is somewhere obvious, and it is.

*This may change.* If searching todos from the palette turns out to be what
the hands reach for, the filter can grow a second section. It is not in the
first cut because Search already exists and duplicating it is the more
expensive mistake.

**Toggle theme.** Not a toggle: appearance is a *picker* over thirteen
palettes in Settings ([themes](./themes.md)). A command called "Toggle
theme" would misrepresent what the setting is, and one command per palette
would bury the rest of the inventory under thirteen rows.

## Commands and shortcuts are different things

**A command is the thing you can do. A shortcut is a key that runs one.**
Most commands have no shortcut and never will.

That distinction is the whole reason this is not simply a widening of
`SHORTCUTS`. The existing `Shortcut` type requires `code`, `primary` and
`shift` — a chord is not optional in it, because until now everything in
that list had one. Adding Settings and Sign out to it would mean either
inventing chords for them, or making the binding fields optional and
keeping a type called `Shortcut` that describes things with no keys.

So the inventory moves up a level:

```
Command   { id, name, group, icon }         — every palette entry
Shortcut  { command, code, primary, shift } — only some commands
```

`SHORTCUTS` stays exactly what it is, a list of key bindings, but each
entry now *names* a command instead of carrying its own `description`. The
name of an action lives in one place, so the palette and the help modal
cannot drift apart.

**The help modal is unchanged in what it lists.** It draws key bindings,
which is still precisely what `SHORTCUTS` holds; it reads the human name
from the command each one references. It gains one line pointing at
`Ctrl+K`, since a list of chords is exactly where someone looks for "is
there a faster way".

## What it looks like

A field at the top, grouped rows beneath, a hint line at the foot.

```
┌────────────────────────────────────────────┐
│  Type a command                            │
├────────────────────────────────────────────┤
│  CREATE                                    │
│  + New todo                            N   │
│  + New list                   Ctrl ⇧ N     │
│  GO TO                                     │
│  ☀ Today                      Ctrl ⇧ 1     │
│  ● Chores                                  │
│  APP                                       │
│  ⚙ Settings                                │
├────────────────────────────────────────────┤
│  ↑↓ move    ↵ run    esc close             │
└────────────────────────────────────────────┘
```

**Grouped, with quiet headings.** The heading carries the verb, so rows
stay short — "Today", "Chores", rather than "Go to Today", "Go to Chores".
With a dozen lists the flat form is a wall of rows all beginning the same
way, which is the noise the headings remove. A group whose rows are all
filtered out hides its heading with them.

**Each row shows its chord, where it has one — on a pointer device.** On
touch both the chords and the hint line at the foot are gone entirely,
because there is no keyboard to press them on: a keycap beside a row reads
as *how you run this*, and on a phone the answer is to tap it. The same
call quick add makes with its Keyboard trigger. Keyed on `pointer: coarse`
rather than a width, since what is being asked is whether a keyboard
exists, not how wide the window is. *(added 2026-08-20, on review.)*

 The palette is the slower
path by definition — anyone who knows the chord uses the chord — so showing
the chord beside the action teaches the faster path while you use the
slower one. Rows for lists show nothing there, which is honest: they have
no chord and cannot.

**Filtering is fuzzy**, via `fuse.js` — already a dependency, and already
how [search](./search-view.md) and quick add's `#` autocomplete rank names.
Three ways of finding something by typing part of it should rank the same
way.

**No match says so plainly** and offers nothing else. In particular it does
not offer to search todos for the same text: that would make the palette a
worse front door to Search than Search's own view, and blur the line this
spec draws.

## Keyboard

| Key | Does |
|---|---|
| `Ctrl+K` | open |
| `↓` / `Ctrl+N` | next |
| `↑` / `Ctrl+P` | previous |
| `Enter` | run the highlighted command |
| `Esc` | close, running nothing |

**`Ctrl+N`/`Ctrl+P` alongside the arrows**, exactly as quick add's `#`
autocomplete already does — same readline convention, same reason: the
hands stay on the home row through an interaction whose whole point is
speed. Two ways to walk a list is not redundancy when one of them is what
the owner's fingers already do everywhere else.

**`K` was reserved for this.** Quick add moved to a bare `N` on 2026-08-14
specifically to release it, on the reasoning that quick add is used ten
times a day and should not surrender the key it earned to a feature that
did not exist yet.

**`Ctrl`, not `Cmd`** — like every other chord in the app, and deliberately
so ([ui.md](./ui.md) — keyboard shortcuts). `metaKey` is explicitly not
accepted, so `Cmd+K` cannot shadow whatever the browser does with it. The
issue was filed as "Cmd/Ctrl+K" before that decision; this is `Ctrl+K`.

**Focus management comes from Base UI's `Dialog`** ([ui.md](./ui.md) —
overlays), not from a hand-rolled trap.

## Nothing is ever unavailable

Every command in the inventory works from anywhere: you can always create,
always navigate, always open Settings. So the question the issue raises —
whether unavailable commands are hidden or shown disabled — has no case to
decide, and the palette has no availability rule at all.

This is a consequence of leaving per-todo actions out rather than an
independent decision. If contextual commands are ever added, the rule will
have to be designed then; inventing one now would be machinery for a case
that cannot arise. *(settled 2026-08-20.)*

## On touch

**Two floating buttons, bottom-right: Todo, and Commands.** Labelled
rather than icon-only — two floating circles are a guessing game, and a
terminal prompt says nothing on its own. Set in the sans, like every other
control.

Not `LuCommand`, which is the ⌘ glyph: the app binds `Ctrl` on every
platform and refuses `metaKey` outright ([ui.md](./ui.md) — keyboard
shortcuts), so an icon naming the one modifier it does not use would be
wrong on a Mac and meaningless elsewhere. *(changed 2026-08-20, on
review.)*

Hidden above 768px, which is a question about **width** rather than about
the pointer: below that the sidebar collapses into a drawer, so the two
things done most often sit behind a gesture. A touch laptop at full width
keeps its sidebar and needs no floating shortcut to it. There is no
keyboard to press `Ctrl+K` on, so the palette needs a surface of its own,
and the same gesture problem applies to quick add — the nav drawer holds
both today, which means opening a drawer to reach the two things you do
most.

The palette itself is unchanged on touch: the same grouped list, filtered
by the on-screen keyboard, with the arrow-key hints omitted since there are
no arrow keys.

*Placement is a first cut and wants a human's eye.* Bottom-right is the
conventional reach zone for a right-handed thumb, but the app has nothing
floating on mobile today, and whether two buttons should sit centred or
right-aligned — and how they clear the completed-todos affordance at the
foot of a long list — is a design judgement rather than a derivable one.
*(flagged 2026-08-20.)*

## Where it lives

- `commands/lib/commands.ts` — the inventory: what each command is called,
  which group it belongs to, and what it does. Pure, no React, no DOM.
- `commands/lib/command-filter.ts` — the fuzzy filter and the grouping,
  also pure, so the ranking is testable without rendering anything.
- `commands/command-palette/` — the dialog itself.
- `shortcuts/lib/shortcuts.ts` — unchanged in shape, but each binding now
  references a command id rather than carrying a `description`.

A barrel for `commands/` only if it ends up collapsing several import paths
(CLAUDE.md — a domain gets a barrel only if it has several consumers).

## Testing

Unit tests own the registry and the filter, as pure functions with no DOM
([testing](./testing.md)):

- every command has a name and a group, and ids are unique;
- every shortcut references a command that exists — the check that keeps
  the two files honest with each other;
- the filter ranks a prefix match above a mid-word one, and finds a list by
  part of its name;
- lists become commands, and a renamed list renames its command.

E2E owns the wiring, in `e2e/tests/command-palette.spec.ts`:

- `Ctrl+K` opens it and `Esc` closes it, running nothing;
- typing filters, and Enter runs the highlighted command;
- both `↓` and `Ctrl+N` walk the list, and both `↑` and `Ctrl+P` walk back;
- a list created in the test appears in the palette by name, and choosing
  it navigates there — the one capability that is genuinely new;
- on mobile, the two floating buttons open quick add and the palette.
