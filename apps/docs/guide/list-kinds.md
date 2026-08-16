# Recognised lists

Name a list **Groceries** and it starts behaving like a grocery list. No
setting to find, nothing to turn on — Fold recognises a handful of list
names, and a list with one becomes a **recognised list** that does a
little extra. You'll see the term *recognised list* used throughout Fold —
in Help, and wherever one of these lists changes what a control does.

A recognised list carries a **sparkle** ✨ next to its name in the sidebar
and beside its title. Click the sparkle at the top of the page to see what
that particular list does.

## The names it knows

Fold matches the **whole name**, ignoring capitals. "Groceries" and
"groceries" are the same; "Weekend Shopping List" is not "Shopping".

| Call your list | And you get |
|---|---|
| Groceries, Shopping, Supermarket, Market, Food shop | Grouping in Today and Summary, plus **Complete all** |
| Chores, Housework, Cleaning, Errands, Jobs, Maintenance | **Complete all** and **Schedule all** |
| Reading, Books, Watching, Films, TV, Listening, Music, Podcasts, Games, Someday, Backlog, Wishlist | No due dates — priority instead |
| Health, Wellbeing, Medical, Meds, Appointments, Doctor, Dentist, Therapy | Always first in Today and Summary |

Plus the obvious variants — singulars, and `to-read`/`to read` either way.

Note what's **not** in the health row: Fitness, Exercise, Gym. Those lists
are often a training log rather than things to do, and pinning one to the
top of Today every day would just teach you to ignore that block.

## Grouping

Your shopping shows up in **Today** and **Summary** as a single row —
"Groceries — 8 items" — rather than eight separate ones.

The reason: looking back at your day, "I did the shopping" is the useful
fact. That you ticked off milk is not. Clicking the row takes you to the
list, where the items are all still there, one per row, exactly as before.

Only grocery lists group. Chores stay as individual rows, because a chore
*is* individually interesting when you're reviewing your day.

## No due dates on a reading list

A reading, watching or listening list holds things you'll **get to** — not
things due by a date. So the due date and time fields simply aren't there
when you open a todo, and [adding one](./adding-todos.md) won't read a date
out of what you type — `Finish Dune next Friday` keeps those words in the
title. Use **priority** to say what's next.
Move a todo out of that list and the due date fields come back.

## Health comes first

Anything on a health list leads **Today** and **Tomorrow** — under a
*Health* heading above everything else, with the rest of your todos under
*Everything else* below it. Not sorted higher: a section of its own, so a
high-priority chore can't push it down.

**Next 7 days** does the same, but inside each day rather than once at the
top — so a health todo stays on the date it's actually due instead of being
pulled to the front of the week. You'll only see the two headings on a day
that has both kinds of todo; a day with just one kind is a plain list.

**Summary** leads its health todos within each day too, but without the
headings: those are already done, so they just come first and carry a
heart ♥ instead.

Health todos are otherwise completely ordinary — no bulk buttons, due dates
work as normal. The only thing that changes is where they show up.

## Complete all

One button, at the top of the list: tick off everything still open in it.
You've done the shopping — the whole list is done.

It asks first, and tells you how many todos it's about to tick. There's no
undo, but nothing is deleted: untick anything individually afterwards.

The button stays visible once you're all caught up, just greyed out.

## Schedule all

On a chores list: give every open todo the same due date. Saturday's jobs
are all due Saturday, and this beats setting seven due dates by hand.

It replaces any due date those todos already have, so it asks first too.

## If Fold gets it wrong

**Rename the list.** A list called "Chores" that you don't want behaving
like one can be called "Household" instead, and the sparkle disappears.

When a grocery list is collapsed into a single row in Today or Summary, that
row carries a **carrot** 🥕 rather than the sparkle — the sparkle means "this
list is special", and on that row Fold can be specific about *how*.

There's no per-list off switch yet. The names Fold matches are specific
enough that this rarely comes up — you have to name a list *exactly*
"chores" to get chores behaviour.

## What this doesn't touch

Nothing about a kind is stored on your server. Fold works it out from the
name each time, so:

- Another app pointed at the same server sees an ordinary list of
  ordinary todos. Nothing custom is written anywhere.
- Renaming a list changes what it does, immediately.
- Nothing to migrate, and nothing to break if you stop using Fold.
