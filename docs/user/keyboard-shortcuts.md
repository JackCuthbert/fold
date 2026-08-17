# Keyboard shortcuts

A short list, and deliberately so. Fold isn't an app you live inside all
day, so the shortcuts cover the things you reach for often enough to be
worth remembering: making something, and getting somewhere.

| Chord | Does |
|---|---|
| `N` | New todo, from anywhere |
| `Ctrl+Shift+N` | New list |
| `Ctrl+Shift+1` | Go to Today |
| `Ctrl+Shift+2` | Go to Tomorrow |
| `Ctrl+Shift+3` | Go to Next 7 days |
| `Ctrl+Shift+4` | Go to Summary |
| `Ctrl+Shift+5` | Go to [Search](./search.md) |
| `Ctrl+/` | Open **Help**, which lists these |

*(changed 2026-08-05: Tomorrow took `Ctrl+Shift+2`, moving Summary to
`Ctrl+Shift+3`. The view chords are numbered by the order the sidebar shows
them, and Tomorrow belongs between the other two.)*

*(added 2026-08-06: Search took `Ctrl+Shift+4`. It went on the end rather
than among the others, so nothing you had already learned moved.)*

*(changed 2026-08-14: **Next 7 days** took `Ctrl+Shift+3`, pushing Summary
to `4` and Search to `5`. Sorry — that's two digits you'd learned. It sits
with the other day views because that is where you'd look for it, and the
numbers follow the sidebar rather than the other way round.)*

There's no `Ctrl+F` for search, on purpose — that would take the browser's
own find away, and the two answer different questions: `Ctrl+Shift+5` looks
through all your todos, `Ctrl+F` looks at the page in front of you.

**`Ctrl` on every platform, including a Mac.** Most Mac apps would use `⌘`
here, and Fold deliberately doesn't: the chords worth having kept colliding
with things `⌘` already means, and one family you can say out loud beats two
that differ by platform.

**Hold `Ctrl` for a moment** and the sidebar shows you every shortcut it
has. Let go and they disappear again. They also appear when you hover a
row.

The **Help** window (the `?` at the bottom of the sidebar) lists them
all, and it's the first thing in there.

## When they don't fire

**While a window is open.** If you're already adding a todo, editing one, or
in Settings, the shortcuts do nothing rather than opening a second window on
top of the first. Close what you're in, and they work again.

**While you're typing.** Anything typed into a text box belongs to that box.

**When you have no lists at all.** New todo asks which list to put it in,
and with none there's nothing to choose. Make a list first — `Ctrl+Shift+N`.

A closed or collapsed sidebar is no obstacle, though. That's exactly when
reaching for the keyboard is quicker than going to find the button.

## Why a bare `N` for a new todo

`Cmd+N` — the obvious choice — belongs to your browser: it opens a new
window, and the keypress never reaches Fold at all. `Ctrl+N` does the same
on Windows and Linux, and inside quick add it already moves through the
`#list` suggestions. A plain `N` collides with none of them.

Unmodified keys are safe here because every shortcut stands down while
you're typing in a field — so an `n` in the middle of a todo is just an
`n`. *(changed 2026-08-15: was `Ctrl+K`.)*

It opens the same **New todo** field as the sidebar button, wherever you
are — see [adding a todo](./adding-todos.md) for what you can type into
it.
Because it can be triggered from Today, Tomorrow, Next 7 days, Summary or
Search — none of which are lists — it always asks which list the todo
belongs to.

## Why `Shift` on the view shortcuts

`Ctrl+1` looks tidier, but on a Mac it's taken twice over: the system uses
it to switch desktops, and some browsers use it to switch tabs. Adding
`Shift` sidesteps both.

## Why `Ctrl+F` isn't one of them

It's the obvious next shortcut, and it's deliberately missing — but not for
the reason it used to be. Search now exists, and it has a chord:
`Ctrl+Shift+5`.

`Ctrl+F` stays with your browser because the two answer different
questions. Fold's search looks through every todo you have, including ones
you've finished and ones not on the screen. `Ctrl+F` looks at the page in
front of you. Taking the second away to give you a second route to the
first would be a straight loss.

*(corrected 2026-08-14: this section still said Fold had no search, which
stopped being true on 2026-08-06 — and it sat directly below a table
listing the search chord.)*
