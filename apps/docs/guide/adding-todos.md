# Adding a todo

Press <kbd>N</kbd> anywhere, or click **New todo**, and type the whole
thing on one line:

```
Clean the gutters tomorrow at 3pm #chores p1
```

That creates "Clean the gutters", due tomorrow at 3pm, in Chores, at high
priority. Press <kbd>Enter</kbd> and it's filed.

You don't have to use any of it. `Buy milk` is a perfectly good todo, and
nothing in the line is required except the words themselves.

## What it recognises

| You type | What it does | Examples |
|---|---|---|
| ordinary words | the todo's title | `Clean the gutters` |
| a date, in plain English | the due date, and a time if you give one | `tomorrow`, `friday`, `next tuesday`, `in 3 days`, `25 Aug`, `3pm`, `tomorrow at 3pm` |
| `#name` | the list | `#chores` |
| `p1` `p2` `p3` | priority — high, medium, low | `p1` |

Whatever is left after those are taken out becomes the title. The parts it
recognised are highlighted as you type, and shown as pills underneath, so
you can see what it understood before pressing Enter.

**The pills are clickable.** If it read the wrong date, or you want a
different list, change it there — the pill rewrites the line for you.

## The first one wins

If you name the same thing twice, **the first is used and the rest are
left alone as ordinary text**:

| You type | Title | List |
|---|---|---|
| `Buy milk #Chores #Work` | Buy milk **#Work** | Chores |

A todo belongs to one list, has one due date and one priority, so there is
nothing sensible for a second `#name` to mean. Rather than guessing — or
silently dropping it — Fold treats it as part of what you wrote. The same
goes for `p1 p3` (high, with "p3" in the title) and for two dates:
`Ship it tomorrow friday` is due tomorrow, and is called "Ship it friday".

You can always tell which one counted: **only the token that was used is
highlighted.** If a word isn't highlighted, it's staying in the title.

## When it leaves things alone

It would rather miss a date than invent one, so ordinary writing survives:

- `Read chapter 3` — a todo called "Read chapter 3", no due date.
- `Fix issue #12` — `#12` isn't one of your lists, so it stays in the
  title.
- `Update the v2 spec` — no date.

It also won't set a due date of *right now*, since a todo that's overdue
the moment you make it isn't useful.

**`p4` is just text.** Some apps use it for "no priority", but that's
already what you get by not saying anything, so Fold leaves it in the
title rather than highlighting a word that changes nothing.

## Notes

The line is for the todo, not for prose. If you want to write more, use
**+ Notes** underneath the field — <kbd>Shift</kbd>+<kbd>Enter</kbd> makes
a new line in there, while <kbd>Enter</kbd> still files the todo.

## Lists that don't use dates

A [recognised list](./list-kinds.md) like Reading has no due dates at all.
On those, dates aren't read from your line — so `Finish Dune next Friday`
keeps every one of those words in the title, and the date pill says why
it's unavailable. Set a priority instead to say what's next.
