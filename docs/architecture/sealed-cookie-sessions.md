# Decision: Credentials sealed in an encrypted cookie

Implements [specs/authentication](../specs/authentication.md).

`POST /api/session` verifies credentials against the CalDAV server, then
seals `{serverUrl, username, password}` with AES-256-GCM
(`apps/server/src/crypto/seal.ts`) into an httpOnly, SameSite=Strict
cookie. Every request unseals it and builds a fresh tsdav client.

**Why store the password at all?** CalDAV has no delegation standard a
generic client can rely on; Basic auth per request is the interoperable
reality. The password is never readable by the browser (httpOnly) and
never stored server-side.

**Why not server-side sessions?** A session table adds state, expiry
management, and another failure mode; sealing keeps the server restartable
and horizontally trivial.

**Consequences:** `SESSION_SECRET` rotation invalidates all sessions
(users just log in again). TLS is mandatory in production — enforced by
the cookie's Secure flag when `NODE_ENV=production`.
