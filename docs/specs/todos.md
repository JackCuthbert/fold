# Todos

The core entity: a VTODO component inside a list collection
([lists](./lists.md)).

## Data model (`packages/schemas`)

Zod schemas are the single source of truth; TypeScript types are inferred
(`z.infer`).

| Field | Type | iCalendar mapping |
|---|---|---|
| `uid` | string | `UID` |
| `listId` | string | containing collection ([lists](./lists.md)) |
| `href` | string | resource URL |
| `etag` | string | HTTP ETag ([sync-and-offline](./sync-and-offline.md)) |
| `summary` | string | `SUMMARY` |
| `completed` | boolean | derived from `STATUS:COMPLETED`; setting it writes `STATUS`, `PERCENT-COMPLETE:100`, and a `COMPLETED` timestamp |
| `due?` | date or date-time | `DUE` (timezone-aware) |
| `description?` | string | `DESCRIPTION` |
| `priority?` | `high` \| `medium` \| `low` | `PRIORITY`: writes 1/5/9; reads 1–4 → high, 5 → medium, 6–9 → low; absent/0 → none |

Only these properties are *managed*; everything else on a VTODO is preserved
verbatim on edit ([caldav-compliance](./caldav-compliance.md)).

Sub-tasks (`RELATED-TO`) are a documented future enhancement
([overview — non-goals](./overview.md#non-goals-future-enhancements)).

## Behavior

- **Quick add:** input at the top of the todo pane; Enter adds and keeps
  focus for rapid entry. New todos get a generated UID and `DTSTAMP`.
- **Sorting (active):** overdue first, then due date ascending, then
  priority (high → low), then creation order.
- **Overdue:** items with `due` in the past are visually flagged
  ([ui](./ui.md)).
- **Editing:** tapping/clicking a todo opens a detail view (react-hook-form)
  for summary, due date, notes, and priority.
- **Completed handling:** completed items move to a collapsible "Completed"
  section per list with a count. "Clear completed" deletes them from the
  server after confirmation.
- All mutations are optimistic and queue through the outbox
  ([sync-and-offline](./sync-and-offline.md)).
