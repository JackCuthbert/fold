# Decision: Stateless BFF over raw proxy or client-side CalDAV

Implements [specs/overview](../specs/overview.md) and
[specs/api](../specs/api.md).

The Bun server is a backend-for-frontend: it exposes a JSON API and speaks
CalDAV out the back using tsdav + ical.js (`apps/server/src/caldav/`).

**Why not client-side CalDAV?** CORS makes "works with any compliant
server" impossible from a browser, and DAV/XML in the client bloats it.

**Why not a raw byte-forwarding proxy?** tsdav would then run in the
browser (same problem), and the client would need to parse iCalendar.

**Why stateless?** No database or session table to operate; credentials
travel in an encrypted cookie
([sealed-cookie-sessions](./sealed-cookie-sessions.md)). The tradeoff is
CalDAV discovery round-trips on each API call, acceptable for a personal
todo client.

**Consequences:** handlers depend on a `CaldavGateway` interface, unit
tests fake it, and only the Radicale integration suite touches tsdav.
