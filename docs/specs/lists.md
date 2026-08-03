# Lists (CalDAV collections)

A "list" is a CalDAV calendar collection that supports the `VTODO` component.
Full list management is in scope: discover, create, rename, delete.

## Data model (`packages/schemas`)

- **TodoList:** `id`, `href`, `displayName`, `ctag`.
- `id` is derived from the collection href, URL-encoded for use in API paths
  ([api](./api.md)).

## Operations

| Operation | CalDAV mechanism |
|---|---|
| Discover | PROPFIND on the calendar home set, filtered to collections whose `supported-calendar-component-set` includes `VTODO` (collections advertising no component set are included) |
| Create | MKCALENDAR with `displayname` + VTODO component set; fallback to extended MKCOL if MKCALENDAR is unsupported |
| Rename | PROPPATCH on `displayname` |
| Delete | DELETE on the collection |

## Ordering

*(added 2026-08-01: the client sorted alphabetically while the server
returns collection order, so a newly created list appeared in one position
and then jumped when the server response landed.)*

**Lists are sorted alphabetically by display name in the client**, on read
and on optimistic insert alike, so the two always agree and a new list
never moves once the server responds.

*(settled 2026-08-01, after two wrong attempts. The server's order is not
something we can match: Radicale returns collections in filesystem order
of their directory names, which are UUIDs — arbitrary, and unpredictable
from the client. Verified live: a new list landed at position 0
optimistically and came back from the server at position 2. Since no
optimistic guess can reliably match an arbitrary order, the client imposes
its own stable one instead. This is not "the server sorts alphabetically"
— an earlier comment claimed that and it was false.)*

User-defined ordering, persisted to the server, is a wanted feature; see
[backlog](./backlog.md). *(deduplicated 2026-08-02: this was stated twice.)*

The [Today view](./today-view.md) is pinned above these collections in the
nav. It is derived, not a collection, so this ordering does not apply to it.

## Behavior

- Lists appear in a sidebar (desktop) or drawer (mobile) — see [ui](./ui.md).
- Deleting a list requires confirmation (destructive; deletes all contained
  todos on the server).
- List create/rename/delete work offline and queue through the outbox like
  todo mutations ([sync-and-offline](./sync-and-offline.md)).
- The collection `ctag` is used to detect remote changes cheaply on refetch
  ([caldav-compliance](./caldav-compliance.md)).
