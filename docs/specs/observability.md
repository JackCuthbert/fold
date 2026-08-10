# Observability

What the server records about the requests it serves, and — more
importantly — what it deliberately does not.

*(added 2026-08-10.)*

## Access logging

One line of JSON per request, on stdout — where `docker logs`, and any log
shipper pointed at the container, will find it. JSON rather than a
human-formatted line so it stays queryable without being regex'd apart
again.

```json
{"msg":"request","method":"DELETE","route":"/api/lists/:listId","status":401,"outcome":"client","durationMs":1}
```

| Field | Meaning |
|---|---|
| `msg` | Always `request`. Discriminates access lines from anything else on stdout. |
| `method` | HTTP method. A fixed vocabulary. |
| `route` | The matched **route pattern**, or `null` when nothing matched. |
| `status` | HTTP status. |
| `outcome` | `ok` / `client` / `fail` / `upstream` — see below. |
| `durationMs` | Whole milliseconds, measured with a monotonic clock. |

Static requests are logged with `route: "static"` and no path, which is
enough to see that asset serving is healthy.

### Outcome

The status code says what was returned; `outcome` says whose problem it is,
which is the thing worth alerting on.

- **`ok`** — under 400.
- **`client`** — 4xx. A bad or unauthenticated request. Includes `401`,
  which is *routine*: the SPA probes `GET /api/session` on load.
- **`fail`** — 5xx other than 502. This server broke; a bug.
- **`upstream`** — `502`. The **CalDAV server** failed or timed out
  ([api](./api.md) — error mapping). Not the same operational event as
  `fail`, and separating them is the difference between "Fold is broken"
  and "the CalDAV box is down".

## Zero personal information

**The log contains no personal data at all**, and that is enforced by
construction rather than by discipline: `AccessLogEntry`
(`apps/server/src/observability/access-log.ts`) is a closed set of
non-identifying fields, so the only way to log something sensitive is to
add a field for it. Redaction at the point of writing was rejected — it
puts every future call site one forgotten `delete` away from a leak.

What is absent, and why each would be personal data:

- **The raw path.** Logged as the *pattern* — `/api/lists/:listId`, never
  the concrete URL. A list id is a CalDAV collection identifier and a
  stable per-user handle; a log of them is a log of who has what.
- **Query strings and request bodies.** Todo titles and notes are the
  user's own words, and the sign-in body carries their CalDAV password.
- **Cookies and `authorization`.** The session cookie *is* the sealed
  credential ([sealed-cookie-sessions](../architecture/sealed-cookie-sessions.md))
  — logging it is logging the password.
- **The CalDAV server URL.** Frequently a personal hostname, and it
  identifies the user's provider.
- **Client IP and `user-agent`.** Both identify the person; an IP is
  personal data under the GDPR on its own.

An unmatched route logs `route: null` rather than the path it failed to
match, so arbitrary user- or attacker-supplied strings never reach the log
either.

### How this is held

`apps/server/test/access-log.test.ts` asserts against the **whole emitted
line** rather than named fields, so a leak through a field the test does
not know about still fails. A final test parses each line through a
`.strict()` zod schema, which fails on *any* undeclared field — so adding
one has to be deliberate enough to update that list, which is the moment to
ask whether it is personal data.

Verified against a running server (2026-08-10): a `DELETE
/api/lists/<id>` logged the pattern with the id absent, and a sign-in
`POST` carrying a password, username, CalDAV host, `x-forwarded-for` and
`user-agent` leaked none of them.

## What is not here

No metrics endpoint, no tracing, no request id, and no log level. Fold is a
single stateless process serving one household
([deployment](./deployment.md)); the two questions an operator actually has
are "is it up" and "is it slow", and a timed access log answers both.

A **request id** was considered and left out: it is only useful for
correlating a user's report with a line in the log, and with no other
correlated signal to join against it would be an identifier attached to
every request for no current benefit.
