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

## Logout & expiry

- `DELETE /api/session` clears the cookie.
- A 401 from the CalDAV server maps to a 401 from the API, which routes the
  client to the login screen. The offline outbox is preserved and replays
  after re-login ([sync-and-offline](./sync-and-offline.md)).
