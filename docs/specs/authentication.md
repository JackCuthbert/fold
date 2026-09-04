# Authentication

See [overview](./overview.md) for where authentication sits in the
architecture.

## Login

- Login form (react-hook-form + zod resolver) collects CalDAV server URL,
  username, and password, posted to `POST /api/session`
  ([api](./api.md)).
- The server verifies credentials via CalDAV principal discovery
  (`current-user-principal`). Failure → 401, surfaced on the form.

## Session mechanism

- On success the server seals `{serverUrl, username, password}` into an
  **encrypted httpOnly cookie** (AES-256-GCM, key derived from the
  `SESSION_SECRET` env var). `SameSite=Strict`; `Secure` outside dev.
- Every API request unseals the cookie and constructs a tsdav client for the
  upstream CalDAV server. Fully stateless: survives server restarts, no
  session table, no server-side credential storage.
- The client never sees the password again after submission; the session
  endpoint returns only `{serverUrl, username}` for display.

## The session is never served from cache

*(added 2026-07-31: the persisted query cache included `['session']`, so a
reload rendered the signed-in UI from a stale record while the cookie was
already gone — lists came back empty and the first write logged the user
out.)*

Authentication state lives **only** in the sealed cookie. Therefore:

- `['session']` is **excluded from cache persistence**. Every load asks the
  server who you are; the answer is never restored from IndexedDB.
- The session query is not treated as permanently fresh — it revalidates
  rather than trusting an indefinitely-cached result.
- Until that check resolves the app shows neither the signed-in UI nor the
  login form, so a signed-out user never sees a populated shell.
- Todos and lists remain cached and render offline as before; only *identity*
  requires the server.

## Cached data is scoped to its server

*(added 2026-08-04: signing into a different CalDAV server still showed the
previous server's lists and todos. They were not a brief flash before a
refetch — the persisted cache survived a reload, so one server's data was
rendered under another's credentials.)*

Nothing in the query cache recorded **which server it came from**. So:

- Sign-in and sign-out derive a **server identity** from the server URL and
  username — the same URL can serve different accounts, so both are needed.
  It is stored opaquely (hashed), never as the raw URL and username.
- That identity is the persisted cache's **`buster`**. When it changes,
  TanStack Query discards the persisted cache instead of hydrating it. This
  covers a reload and an expired session, not only a deliberate sign-out.
- The identity must be readable **synchronously, before the first render**,
  since hydration happens before `['session']` resolves. That is why it
  lives in `localStorage` rather than being derived from the session query.
- Sign-in to a different server, and sign-out, also drop the **in-memory**
  data queries. `['session']` itself is never removed — the app is mounted
  on that query, and removing it blanks the UI instead of switching screens.

### The outbox is preserved *per server*

The outbox is deliberately kept across logout so it replays after re-login.
That is right for the **same** server; against a **different** one it would
replay creates, edits and deletes onto list ids that mean something else
there, or nothing at all.

So the outbox key is **namespaced by server identity**. Both halves of the
promise hold at once: queued writes still survive a logout and replay after
re-login, but only ever against the server they were made for. Signing into
another server leaves the first server's queue intact rather than dropping
it — no silent data loss, and no replay against the wrong host.

## Session lifetime

*(added 2026-08-08: the cookie carried no `Max-Age`, making it a browser
**session** cookie. Desktop browsers keep a session alive for weeks, but
iOS discards one as soon as Safari evicts a backgrounded tab — so the app
appeared to log itself out on an iPhone while a desktop tab stayed signed
in indefinitely. The cookie was doing exactly what it had been asked to.)*

- The cookie carries an explicit **`Max-Age` of 7 days**, so it survives
  the browser closing the tab, the app, or itself.
- The expiry is **sliding**: every authenticated request re-issues the
  cookie, so the 7 days measure *inactivity* rather than time since
  sign-in. A session in daily use never ends mid-use; one left alone for a
  week asks again.
- Renewal happens in the router, not in each handler, so every
  authenticated route gets it and a route added later inherits it. It is
  skipped when the handler set its own `Set-Cookie` — otherwise signing out
  would hand back a working session — and on the error path, since a 401
  must never return a cookie.
- Seven days is deliberately short for a "remember me": the cookie seals
  the user's CalDAV credentials, so its lifetime is a *window of use on a
  lost device*, not a convenience setting.

`SameSite=Strict` is retained. It costs a login screen on the first load
when arriving from an external link — the cookie is withheld until a
same-site navigation — which `Lax` would avoid. Kept anyway: CSRF cover
should not rest solely on the API being JSON-only and same-origin, and
`Strict` stays correct if a route is ever reachable by a cross-site GET.
*(reaffirmed 2026-08-08.)*

An **installed PWA on iOS has its own cookie jar**, separate from Safari —
signing in one place does not sign you in the other
([pwa](../architecture/pwa.md)).

The Fold CLI also has its own cookie jar. It receives the same sealed cookie
from `POST /api/session` and persists it in a user-only file. Every successful
request saves any renewed cookie, giving terminal and agent use the same
sliding session lifetime as a browser. The CalDAV password is used for login
and is never stored. No separate API token or server-side session is
introduced.
*(added 2026-09-04: [agentic todo management](./agentic-todo-management.md).)*

## Logout & expiry

- `DELETE /api/session` clears the cookie.
- A 401 from the CalDAV server maps to a 401 from the API, which routes the
  client to the login screen. The offline outbox is preserved and replays
  after re-login ([sync-and-offline](./sync-and-offline.md)) — *(changed
  2026-08-04: per server, as above; the cached lists and todos are not
  preserved across a change of server.)*
