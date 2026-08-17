# Getting started

You need a CalDAV server (Radicale, Nextcloud, Baïkal, …) and its URL.

1. Start the app: `SESSION_SECRET=<random string> bun apps/server/src/index.ts`
   (or use your deployment). Open it in a browser.
2. Enter your CalDAV server URL — usually ends with your username, e.g.
   `https://dav.example.com/alice/` — plus your username and password.
3. Sign in. Your todo lists appear on the left (desktop) or behind the ☰
   button (mobile).

Your credentials are encrypted into a browser cookie and sent only to your
own server. Signing out (or clearing cookies) removes them.

No CalDAV server handy? See
[running a local CalDAV server](./local-caldav-server.md) to try the app
against a throwaway Radicale instance.

See [adding a todo](./adding-todos.md) next — it's the thing you'll do
most — then [lists](./lists.md) and [todos](./todos.md), and
[keyboard shortcuts](./keyboard-shortcuts.md) once you're settled in.
