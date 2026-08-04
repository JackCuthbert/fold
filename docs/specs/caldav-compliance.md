# CalDAV Compliance

The client must work with **any** CalDAV server that correctly implements the
spec (RFC 4791 + RFC 5545), developed and integration-tested against Radicale
([testing](./testing.md)). Compliance has two halves: speaking the protocol
correctly, and never destroying data we don't understand.

## Protocol

- All DAV operations go through `tsdav` server-side; iCalendar parse and
  serialize through `ical.js`.
- Discovery: `current-user-principal` → calendar home set → PROPFIND for
  VTODO-capable collections ([lists](./lists.md)).
- Todos fetched with a calendar-query REPORT filtered to `VTODO`.
- Concurrency via ETags: `If-None-Match: *` on create, `If-Match` on
  update/delete ([sync-and-offline](./sync-and-offline.md)).
  *(added 2026-07-30: a calendar object with no ETag in a REPORT/GET
  response is a hard error, not a silent last-write-wins fallback — our
  entire conflict story depends on ETags, and RFC 4791 servers are
  expected to provide them. The gateway raises a 500 (mapped to 502 for
  the client) rather than defaulting to an empty etag, which would make
  every subsequent update/delete's `If-Match` pre-check fail
  unconditionally.)*
- Collection `ctag` used to short-circuit refetches when nothing changed.
- MKCALENDAR with extended-MKCOL fallback for list creation, since server
  support varies.
- Transient connection resets on idempotent reads (GET/PROPFIND/REPORT) are
  retried at the `fetch` layer before surfacing as `caldav_unreachable`
  ([api](./api.md) — "spurious vs. genuine unreachable").

## Extension properties

*(added 2026-08-03, with list colours and ordering.)*

Two collection properties Fold reads and writes are **Apple extensions in
the `http://apple.com/ns/ical/` namespace, not RFC 4791**:

| Property | Carries | Read | Written |
|---|---|---|---|
| `calendar-color` | A list's colour, 8 hex digits with an alpha suffix (`#1D9BF6FF`) | PROPFIND during discovery | MKCALENDAR at creation; PROPPATCH on edit |
| `calendar-order` | A list's position in the nav, an integer | PROPFIND during discovery | MKCALENDAR at creation; PROPPATCH on reorder |

Fold normalizes the colour to six digits on read and emits eight ending
`FF` on write, since that is the form other clients expect
([lists — colours](./lists.md#colours)).

**Degradation rule: neither property may be load-bearing.**

- A **malformed or unparseable value is treated as absent**, never raised.
  A foreign client writing garbage into either property must not break list
  discovery.
- A server that **ignores or rejects** them keeps working: lists render
  uncoloured and sort alphabetically, which is exactly the behaviour that
  preceded the feature. Degradation is visible, not silent.
- A PROPPATCH returns 207 Multi-Status; a **per-property failure inside the
  body is deliberately not an error**. These are optional properties, and a
  server that refuses them must not break list editing.
- Fold never probes for support and never hides the controls. The
  in-app help modal and an extension badge beside each control say that an
  extension is in play ([ui](./ui.md#the-extension-badge)).

This is the read side of the same rule as below: **Fold never rewrites what
it did not set.** A colour written by Apple Reminders renders exactly as
stored, and renaming a list does not restyle it.

## Round-trip preservation (cornerstone)

Updates never regenerate a VTODO from our model. The flow, implemented in
`packages/vtodo`:

1. GET the existing `.ics` from the CalDAV server (with its ETag).
2. Parse with ical.js; locate the VTODO component.
3. Mutate **only managed properties** ([todos](./todos.md)): `SUMMARY`,
   `STATUS`, `PERCENT-COMPLETE`, `COMPLETED`, `DUE`, `DESCRIPTION`,
   `PRIORITY`, `DTSTAMP`, `LAST-MODIFIED`, `SEQUENCE` (incremented).
   `CREATED` is written **once, on create, and never on update** — it is
   the stable ordering key ([todos](./todos.md) — ordering), so rewriting
   it on edit would reshuffle the list every time a todo changed. On
   create the client's own timestamp is written through rather than
   replaced with server time, so the optimistic copy and the stored copy
   sort identically. *(added 2026-08-01.)*
4. Serialize the whole calendar object back — VALARMs, X-properties,
   RELATED-TO, RRULE, unknown components, and other VTODOs in the same
   resource all pass through untouched.
5. PUT with `If-Match`.

## Request cost

*(added 2026-08-04, issue #24.)*

**A collection's URL is derived, never discovered.** A list id *is* the
last path segment of its collection URL, so resolving one costs nothing.
The gateway used to run full calendar discovery — one PROPFIND of the
calendar home plus one **per collection** — merely to look up an href, on
every read and every write. With 20 lists that was 23 requests to learn
something already known.

**Ask for the state you need, not for everything.** The one piece of live
collection state the read path needs is the ctag (for the short-circuit
above), so `fetchTodos` issues a single `Depth: 0` PROPFIND of *that*
collection. Nothing else needs a round trip at all.

**Outbound requests are capped at six concurrent.** A CalDAV server may
speak **HTTP/1.0**, where connections close after every response and a
client's connection pool has nothing to reuse — Radicale's built-in
server (Python's `wsgiref.simple_server`) is one, and never sets
`protocol_version`. Every request then costs a fresh TCP connection, and
a wide burst becomes a pile of simultaneous connects: 12 at once measured
~1050ms against HTTP/1.0 versus 14ms against an HTTP/1.1 keep-alive
server, on the same runtime.

*(corrected 2026-08-04: this was first attributed to a Bun `fetch`
pooling bug. It is not — Node 24 shows the same ~1089ms, and pooling
isn't failing so much as being denied by a server that won't keep
connections open. A production Radicale behind uWSGI/Gunicorn speaks
HTTP/1.1 and would not show this.)*

The cap is worth keeping regardless of the server: the cost is
per-connection, we cannot know what an arbitrary CalDAV server speaks,
and it also covers the fan-out inside tsdav that we don't own.

Measured against a local (HTTP/1.0) Radicale, before and after — the
absolute numbers are inflated by the connection cost above, but the
request *counts* they reflect are real on any server:

| Lists | `fetchTodos` | `createTodo` |
|---|---|---|
| 10 | 1107ms → **9ms** | 2172ms → **22ms** |
| 30 | 1941ms → **11ms** | 3828ms → **19ms** |

Both are now flat in the number of lists rather than growing.

## Robustness rules

- A malformed VTODO from the server is skipped with a logged warning; it
  never crashes the list and is never written back.
- Properties and components we don't manage are opaque: preserved on write,
  ignored on read.
- `DUE` values round-trip in the form the server sent — all-day, UTC,
  floating, or `TZID`-zoned. We never reinterpret one form as another, and
  never resolve a zone using the host machine's local offset. An
  unresolvable `TZID` (no `VTIMEZONE` in the resource) is still preserved
  verbatim. See [todos — due dates and timezones](./todos.md#due-dates-and-timezones).
  *(clarified 2026-07-30: the previous wording was underspecified and
  permitted a host-dependent conversion bug.)*
