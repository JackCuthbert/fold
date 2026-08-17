# Todos

- **Add:** press <kbd>N</kbd>, or click **New todo**, and type the whole
  todo on one line — see [adding a todo](./adding-todos.md).
  *(changed 2026-08-15: was a field at the top of the list.)*
- **Complete:** click the circle. It draws a check, strikes the text
  through, and files the todo under "Completed".
- **Edit:** click a todo's text to open its details — summary, a due date
  with an optional time, priority (high/medium/low, or none), and notes.
- **Order:** overdue first, then by due date, then priority. Overdue dates
  show in red.
- **Completed section:** collapsed by default with a count.

## Due dates

A todo doesn't have a due date until you give it one. Turn on **Due date**
and the date picker appears, starting at today; adjust it from there.

Turn on **Time** underneath it if the todo is due at a particular hour
rather than simply that day. Without a time, it's an all-day todo and isn't
overdue until the day is out.

**To remove a due date, switch "Due date" off.** That's also how you undo a
date set by accident. Switching off **Time** on its own leaves the date and
makes it all-day again.

A todo you've opened also shows a short history beneath its fields, once
there's something to show: when it was **created**, when it was
**completed**, how long it was open (**duration**), and — if it had a due
date — whether it was finished on time, early, or late (**timing**).

## Clearing completed work

A completed todo's timestamp is the only record that the work was ever
done — it's what the Summary view is built from — so clearing is
deliberate rather than a one-click sweep.

**Clear completed…** at the foot of the completed section asks which you
mean:

- **Clear old completed** removes work finished more than 30 days ago.
  Summary only looks back 30 days, so this never deletes anything you can
  still see there.
- **Clear everything completed** takes recent work too. It tells you how
  many todos that is, and how many of them Summary is still showing.

Anything completed without a recorded date is left alone by both — there's
no way to tell how old it is. You can still delete todos one at a time from
their own details.

Everything you do is saved to your CalDAV server immediately — or queued
if you're offline ([offline](./offline.md)).
