# Colours and ordering

You can give each list a colour and put your lists in whatever order you
like. Both are stored on your CalDAV server rather than in this browser, so
they follow you to your other devices — and to your other apps.

## Giving a list a colour

Open the menu at the right of a list and choose **Rename**. The **Edit
list** box that opens has a colour picker under the name field. The same
picker is on the **New list** box, so you can give a list its colour as you
create it.

- **Eight swatches** to pick from, if one of them suits.
- **A hex box**, if none of them do. Type any colour you like —
  `#1D9BF6`, `#4a6f96`, even the short `#abc` form. The swatches are a
  shortcut, not a limit.
- **A colour wheel**, if you'd rather point at one than type it.

To take a colour off again, click the **✕** swatch at the end of the row,
or empty the hex box.

The name and the colour save together, so changing both is one edit.

### Where the colour shows up

A dot appears before the list's name in the sidebar, and when that list is
selected, the marker down its left edge takes the same colour.

Every list gets a dot, even one with no colour — that one is drawn as an
empty ring. It's there so the names all line up, and so a list doesn't
shuffle sideways the moment you give it a colour.

One small thing you might notice: if you pick a colour very close to the
page background, the selection marker quietly uses the app's own accent
colour instead, so you can still tell which list you're in. The dot always
shows the colour you actually chose, and nothing you set is ever changed.

### Your other apps see the same colours

The colour lives on your server, on the list itself. Set one in Apple
Reminders or Thunderbird and it shows up here; set one here and it shows up
there.

Fold never repaints a colour it didn't set. If a list came from another app
with a colour that matches none of the swatches, that's fine — it stays
exactly as it is, and the hex box shows you what it is.

## Putting lists in order

Open the menu at the right of a list and choose **Move up** or **Move
down**. The list moves one place, and the new order saves to your server.

There's no dragging. Reordering is a rare thing to do, and buttons work the
same with a mouse, a finger, or a keyboard.

Only the two lists that swapped are written — the rest are left alone.

A new list is placed after the ones you've already arranged, and it stays
put. It won't appear in one place and then hop somewhere else a moment
later.

## If your server doesn't support this

Colours and ordering use two extras that Apple added to CalDAV rather than
parts of the original standard. Most servers handle them, Radicale
included, but not every one does.

If yours doesn't, nothing breaks — it just ignores them:

- Lists stay uncoloured. You can still pick a colour; it won't stick.
- Lists fall back to alphabetical order, and **Move up** / **Move down**
  won't hold.

You'll see this straight away rather than being told everything is fine, so
if a colour doesn't stay put, that's the reason.

Look for the small **i** beside the colour picker — it's a reminder that
this relies on those extras. The **?** at the bottom of the sidebar says the
same, and covers ordering too.

---

Also see [lists](./lists.md) for creating, renaming and deleting, and
[offline](./offline.md) for what happens when you change a colour or an
order with no connection.
