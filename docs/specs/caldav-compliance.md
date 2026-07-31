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

## Round-trip preservation (cornerstone)

Updates never regenerate a VTODO from our model. The flow, implemented in
`packages/vtodo`:

1. GET the existing `.ics` from the CalDAV server (with its ETag).
2. Parse with ical.js; locate the VTODO component.
3. Mutate **only managed properties** ([todos](./todos.md)): `SUMMARY`,
   `STATUS`, `PERCENT-COMPLETE`, `COMPLETED`, `DUE`, `DESCRIPTION`,
   `PRIORITY`, `DTSTAMP`, `LAST-MODIFIED`, `SEQUENCE` (incremented).
4. Serialize the whole calendar object back — VALARMs, X-properties,
   RELATED-TO, RRULE, unknown components, and other VTODOs in the same
   resource all pass through untouched.
5. PUT with `If-Match`.

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
