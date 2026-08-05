# Lists that do more

Name a list **Groceries** and it starts behaving like a grocery list. No
setting to find, nothing to turn on — Fold recognises a handful of list
names and gives those lists a little extra.

A list that Fold recognises carries a **sparkle** ✨ next to its name in
the sidebar and beside its title. Click the sparkle at the top of the page
to see what that particular list does.

## The names it knows

Fold matches the **whole name**, ignoring capitals. "Groceries" and
"groceries" are the same; "Weekend Shopping List" is not "Shopping".

| Call your list | And you get |
|---|---|
| Groceries, Grocery, Shopping | Grouping in Today and Summary, plus **Complete all** |
| Chores, Chore | **Complete all** and **Schedule all** |
| Reading, To-Read, Watching, To-Watch, Listening, To-Listen | The sparkle, for now |
| Health, Wellbeing | The sparkle, for now |

The last two are recognised but don't do anything yet.

## Grouping

Your shopping shows up in **Today** and **Summary** as a single row —
"Groceries — 8 items" — rather than eight separate ones.

The reason: looking back at your day, "I did the shopping" is the useful
fact. That you ticked off milk is not. Clicking the row takes you to the
list, where the items are all still there, one per row, exactly as before.

Only grocery lists group. Chores stay as individual rows, because a chore
*is* individually interesting when you're reviewing your day.

## Complete all

One button, at the top of the list: tick off everything still open in it.
You've done the shopping — the whole list is done.

It asks first, and tells you how many todos it's about to tick. There's no
undo, but nothing is deleted: untick anything individually afterwards.

## Schedule all

On a chores list: give every open todo the same due date. Saturday's jobs
are all due Saturday, and this beats setting seven due dates by hand.

It replaces any due date those todos already have, so it asks first too.

## If Fold gets it wrong

**Rename the list.** A list called "Chores" that you don't want behaving
like one can be called "Household" instead, and the sparkle disappears.

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
