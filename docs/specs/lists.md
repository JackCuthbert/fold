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

**Lists render in the order the server returns them.** We do not re-sort.
A new list is appended at the end — where the server will also place it —
so nothing moves once the response arrives.

Reordering lists on the server is a wanted feature; see
[backlog](./backlog.md).

## Behavior

- Lists appear in a sidebar (desktop) or drawer (mobile) — see [ui](./ui.md).
- Deleting a list requires confirmation (destructive; deletes all contained
  todos on the server).
- List create/rename/delete work offline and queue through the outbox like
  todo mutations ([sync-and-offline](./sync-and-offline.md)).
- The collection `ctag` is used to detect remote changes cheaply on refetch
  ([caldav-compliance](./caldav-compliance.md)).
