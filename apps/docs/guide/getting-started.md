# Getting started

Fold is a todo client, not a todo service — it stores nothing itself and
keeps your todos on a CalDAV server you control. You need that server and
its URL before you can sign in.

## What you need

- **A CalDAV server.** Radicale, Nextcloud, Baïkal and Synology all work,
  as does anything else that speaks the standard.
- **Its URL, your username and your password.** The URL usually ends with
  your username, like `https://dav.example.com/alice/`.
- **Fold itself**, either running already or self-hosted with Docker. See
  [installing Fold](./installing.md) to set one up.

## Sign in

1. Open Fold in a browser.
2. Enter your server URL, username and password.
3. Select **Sign in**.

Your lists appear in the sidebar on the left. On a phone, select ☰ to open
them.

If sign-in fails, the most common cause is the URL. Check that it includes
your username and ends with a slash — `https://dav.example.com/alice/`,
not `https://dav.example.com`.

## Where your password goes

Fold has no accounts and no database. Your credentials are encrypted into a
cookie in your own browser and used only to talk to the server you named.
Signing out clears them, as does clearing your browser's cookies.

## Next

[Adding a todo](./adding-todos.md) covers the one thing you'll do most —
typing a todo, its date, its list and its priority on a single line. After
that, [lists](./lists.md) and [todos](./todos.md) cover organising what you
have, and [keyboard shortcuts](./keyboard-shortcuts.md) is worth a look
once you're settled in.
