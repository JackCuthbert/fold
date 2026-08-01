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
| `due?` | date, or date-time in one of three timezone forms | `DUE` (see [Due dates and timezones](#due-dates-and-timezones)) |
| `description?` | string | `DESCRIPTION` |
| `priority?` | `high` \| `medium` \| `low` | `PRIORITY`: writes 1/5/9; reads 1–4 → high, 5 → medium, 6–9 → low; absent/0 → none |

Only these properties are *managed*; everything else on a VTODO is preserved
verbatim on edit ([caldav-compliance](./caldav-compliance.md)).

Sub-tasks (`RELATED-TO`) are a documented future enhancement
([overview — non-goals](./overview.md#non-goals-future-enhancements)).

## Due dates and timezones

*(added 2026-07-30: the original "date or date-time (timezone-aware)" was
underspecified and led to silent corruption of non-UTC values — see
[round-trip-preservation](../architecture/round-trip-preservation.md).)*

RFC 5545 permits four `DUE` forms, and a compliant client must not silently
convert between them. `TodoDue` is a discriminated union preserving the form
the server sent:

| Form | iCalendar | `TodoDue` |
|---|---|---|
| All-day | `DUE;VALUE=DATE:20260810` | `{kind:'date', value:'2026-08-10'}` |
| UTC | `DUE:20260810T090000Z` | `{kind:'utc', value:'2026-08-10T09:00:00.000Z'}` |
| Floating (no zone — means "9am wherever you are") | `DUE:20260810T090000` | `{kind:'floating', value:'2026-08-10T09:00:00'}` |
| Zoned | `DUE;TZID=Australia/Brisbane:20260810T090000` | `{kind:'zoned', tzid:'Australia/Brisbane', value:'2026-08-10T09:00:00'}` |

Rules:

- **Never reinterpret one form as another.** A floating or zoned value must
  never be converted using the host machine's local offset — that makes the
  result depend on where the server happens to run.
- `readTodo` reports the form as stored; `applyChanges` writes back the same
  form it was given. Editing an unrelated field must leave a foreign client's
  floating or zoned `DUE` byte-equivalent.
- Zoned values keep their `TZID` verbatim. We do not resolve the zone to an
  instant, and we do not require the resource's `VTIMEZONE` to be present or
  parseable — an unresolvable `TZID` is still round-tripped intact.
- Our own UI writes `date` (all-day) or `utc` when the user picks a time;
  `floating` and `zoned` exist to preserve what other clients wrote.

### Ordering and overdue comparison

Sorting and the overdue flag need a single instant per todo. Resolve each
form to a comparison instant **in the viewer's local timezone**, since that
is what "overdue" means to the person reading the list:

- `date` — end of that local day (an all-day todo isn't overdue until the
  day is over).
- `utc` — the instant as given.
- `floating` — the wall-clock time interpreted in the viewer's local zone
  (this is precisely what "floating" means).
- `zoned` — the wall-clock time interpreted in its `TZID` via `Intl`; if the
  zone is unknown to the runtime, fall back to treating it as floating.

This resolution is for display ordering only — it must never be written back
to the server ([caldav-compliance](./caldav-compliance.md)).

Active todos sort by: overdue first, then due date, then priority, then
**oldest-created first**.

That last key is not cosmetic — it is what stops a newly-added todo from
jumping. A CalDAV server's own todo order is arbitrary (Radicale returns
resources in filesystem order of their UUID-named files, the same problem
[lists](./lists.md) describes for collections), so a todo with neither a
due date nor a priority — the common case — ties on every other key and
would otherwise take whatever position the server happened to return. The
optimistic insert appends it locally; the server response then moved it.

To make the two agree, the client stamps `CREATED` (RFC 5545 §3.8.7.1) at
creation time and the server writes that value through rather than
substituting its own. Because the value is identical before and after the
round-trip, the client can place a new todo exactly where the server copy
will land: at the end, where it was added, and it stays there. `CREATED` is
written once and never rewritten on edit — unlike `DTSTAMP`, which tracks
last-modified and so would reshuffle the list on every change.

Todos with no `CREATED` (written by another client, or predating this
behaviour) sort ahead of those that have one, keeping them in a stable
block rather than interleaving unpredictably. *(added 2026-08-01: new todos
visibly re-ordered after being added.)*

## Behavior

- **Quick add:** input at the top of the todo pane; Enter adds and keeps
  focus for rapid entry. New todos get a generated UID and `DTSTAMP`.
- **Sorting (active):** overdue first, then due date ascending, then
  priority (high → low), then creation order.
- **Overdue:** items with `due` in the past are visually flagged
  ([ui](./ui.md)).
- **Priority is colour-coded** on the row, all three levels — not just
  high. *(added 2026-07-31.)* High reads as urgent (red), medium as
  cautionary (amber), low as calm (green or blue). Reuse the semantic
  status colours rather than inventing a second palette, keep them muted
  enough for the restrained aesthetic, and keep the label as text so
  meaning never depends on colour alone.
- **Editing:** tapping/clicking a todo opens a detail view (react-hook-form)
  for summary, due date, notes, and priority.
- **Completed handling:** completed items move to a collapsible "Completed"
  section per list with a count. "Clear completed" deletes them from the
  server after confirmation.
- All mutations are optimistic and queue through the outbox
  ([sync-and-offline](./sync-and-offline.md)).
