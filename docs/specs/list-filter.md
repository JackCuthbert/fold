# The list filter

*(added 2026-08-05.)*

Hide some of your lists — from the nav **and** from every derived view — in
one gesture, and put them back in another.

## The case it is for

**Screensharing.** You are showing colleagues your work and would rather
not project "Therapy", "Divorce paperwork" or the name of a job you are
applying for. It is a mode you turn on before a call and off after it, not
a property of a list.

That is the whole design brief, and it decides most of what follows.

## Why a filter rather than a "work" list kind

The obvious alternative was a `WORK_LIST` [kind](./list-kinds.md) plus a
privacy mode that shows only work lists. It was rejected:

- **A kind is a guess, and privacy cannot be guessed.** Kinds infer
  behaviour from a name, which is fine when a wrong guess means the
  shopping didn't group. Here a false negative *leaks*: `Job`, `Client
  work`, `Consulting` and every employer's name would fail to match, and a
  screenshare would show what it was meant to hide.
- **Inverting it is worse.** "Hide everything except recognised names"
  makes a newly created list invisible by default — you cannot find your
  own todos.
- **It only has one shape.** "Show only work" cannot express "show only
  *this* project", which is as often what a screenshare needs. An explicit
  filter does both.

## What it hides

**The nav rows and the derived views, together.** Hiding a list removes it
from the sidebar as well as from Today, Tomorrow and Summary. Filtering the
views alone would leave the name legible in the nav, which defeats the
entire purpose.

**One filter, shared by every derived view.** You are hiding lists from the
room, not from one view, so there is one thing to turn off afterwards
rather than three that can disagree.

**A list view is never filtered.** Opening a list by name is asking for it
specifically; hiding its contents then would be a contradiction. Hiding the
list you are *currently looking at* moves you to Today, though — leaving its
todos on screen while its row vanishes from the nav would hide the evidence
and keep the contents.

## What is stored

**The ids of the hidden lists** — not the shown ones. The two are not
symmetric once lists can be created:

- Storing what to **show** makes a list created later invisible, because it
  is not in the set. A filter set last week would silently swallow a list
  made today, from a view that gives no hint it is doing so.
- Storing what to **hide** shows anything the filter has never heard of. A
  new list appears; only the lists you actually unticked stay away.

A filter is a temporary narrowing, not a permanent allow-list, and hiding
new work behind a setting the user cannot see from the view that is hiding
it is the one failure this feature must not have.

Consequences that fall out of the same choice:

- An id naming a list that no longer exists simply hides nothing.
- An empty set and "no filter" mean the same thing, and no filter is the
  canonical form.
- **The view can never be emptied by the filter.** Unticking the last
  visible list clears the filter instead — "hide all of my lists" has one
  sensible reading, and an empty view with an invisible cause is not it.

It **persists** across reloads. The case is a call, and a filter that
silently reset would be worse than none: you would have to re-check it
every time you doubted it. A corrupt stored value is read as "no filter"
rather than throwing — the safe direction is a filter you have to set
again, never one that hides todos unaccountably.

## Where it lives

**A ghost icon button at the trailing edge of the nav's title row**, beside
the app's mark, with the same treatment as Help and Settings in the footer —
the app's other two "adjust something" controls.

It arrived there by elimination. In the content header it made that column
title + count + actions deep and could not hide nav rows at all; as a
full-width nav row — at either end, with or without a rule — it gave a
control reached twice a day the presence of a primary action. An icon on
the title row costs no vertical space, and that row was otherwise empty to
the right of the mark.

The popover is anchored by its **trailing** edge (`align="end"`), since the
trigger sits at the nav's right edge and a centred popup hung out over the
content column.

## Saying that it is on

**"N lists hidden", as the last row of the nav's list group** — exactly
where the hidden rows would have been, which is where the eye goes when a
list you expected is not there. A status dot on the trigger was tried
first; it said only *that* something was filtered, and from the wrong end
of the group.

The trigger also takes the accent colour while lists are hidden, and keeps
its pressed treatment while the popover is open. Neither is the only
signal: the row states it in words, and the trigger's accessible name
carries the count for a screen reader, which gets nothing from a colour.

## Revealing

**Clicking "N lists hidden" asks first**, and the confirm is green.

This is the one control in the app whose misclick is embarrassing rather
than merely wrong — a stray click puts every hidden list on a projector.
But unhiding is trivially reversible, so it does not get Delete's red;
spending that red here is what stops it working where it matters
([ui](./ui.md) — overlays).

## Not a per-list setting

A "hide this list" flag in each list's menu was considered and rejected: it
is a property that outlives the call, when what is wanted is a mode with
one gesture on and one gesture off. It would also have needed a second
mechanism to answer "why is this list missing?", which is the question the
"N lists hidden" row exists for.
