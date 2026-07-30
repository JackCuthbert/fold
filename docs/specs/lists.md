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

## Behavior

- Lists appear in a sidebar (desktop) or drawer (mobile) — see [ui](./ui.md).
- Deleting a list requires confirmation (destructive; deletes all contained
  todos on the server).
- List create/rename/delete work offline and queue through the outbox like
  todo mutations ([sync-and-offline](./sync-and-offline.md)).
- The collection `ctag` is used to detect remote changes cheaply on refetch
  ([caldav-compliance](./caldav-compliance.md)).
