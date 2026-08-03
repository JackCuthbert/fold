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
- Our own UI writes `date` (all-day) or `zoned` (when the user picks a
  time); `utc` and `floating` exist to preserve what other clients wrote.
  *(changed 2026-08-02: was `utc`. A todo due "9am" means 9am where you set
  it — `zoned` says that directly and keeps saying it after you travel or
  DST shifts, whereas `utc` fixes an instant whose wall-clock reading drifts.
  See [Due times](#due-times).)*

### Due times

*(added 2026-08-02: the UI previously offered only a date, so every todo we
wrote was all-day even though the model already supported times.)*

A todo may be **all-day** or **due at a time**. The time is optional
everywhere it appears; leaving it empty keeps the todo all-day.

- All-day writes `DUE;VALUE=DATE:20260810` (`kind:'date'`) exactly as before.
- A time writes `DUE;TZID=<zone>:20260810T090000` (`kind:'zoned'`), where
  `<zone>` is the viewer's IANA zone from
  `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- **A time requires a date.** Time-without-date is not expressible in
  `DUE`, so the form rejects it rather than silently discarding the time.
- Clearing the time returns the todo to all-day; clearing the date clears
  `DUE` entirely.

The client emits no `VTIMEZONE` alongside the `TZID`, following the existing
rule above — we neither require nor generate one. In practice Radicale
*adds* a matching `VTIMEZONE` to the stored resource itself, so the file on
disk is fully RFC 5545 compliant without the client generating one. A server
that doesn't do this still round-trips correctly, since an unresolvable
`TZID` is preserved intact either way. *(verified 2026-08-02 against
Radicale.)*

**Deciding whether the due date changed.** The edit form must compare the
*date and time inputs*, never a `TodoDue` rebuilt from them. The two inputs
cannot distinguish `floating` from `zoned` — both render as the same date
and time — so a rebuilt value is always `zoned` and would look like an edit
even when the user touched nothing, rewriting a foreign client's `DUE` on an
unrelated change. *(added 2026-08-02: this exact bug shipped briefly and was
caught by checking the stored `.ics` after a summary-only edit.)*

**Display.** A todo due at a time shows that time next to its date; an
all-day todo shows only the date. This matters because the ordering rule
below resolves an all-day `date` to *the end of its local day*, so
rendering a formatted time for every todo would label all-day items
"11:59 pm". Formatting must branch on the form, not on the resolved
instant.

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

## Metadata (detail view)

*(added 2026-08-02.)*

The detail view ends with a read-only footer of facts *about* the todo,
below the actions and separated by a hairline. It is a footnote, not a set
of fields: muted, small, and never editable.

Every row appears **only when the data behind it exists**, so the footer
grows with what is known rather than showing blanks. An open todo typically
shows Created alone; a completed one with a due date shows all four.

| Row | Shown when | Content |
|---|---|---|
| Created | `created` is present | "Today at 11:36", "2 Aug at 9:15" — the same day wording as [Summary](./summary-view.md)'s headings, plus a time |
| Completed | `completedAt` is present | As above, for the completion |
| Duration | both `created` and `completedAt` are present | How long the todo was open — "Open for 3 hours" |
| Timing | both `completedAt` and `due` are present | Whether it was done early, on time, or late, with a rough margin |

**Everything here is derived from RFC 5545 properties the VTODO already
carries** — `CREATED`, `COMPLETED`, `DUE`. Nothing needs storage of our own,
so it works against any compliant server
([caldav-compliance](./caldav-compliance.md)) and reads correctly for todos
created by other clients. Facts that would need our own bookkeeping — how
many times a due date was pushed, for instance — are deliberately out of
scope for that reason.

### Duration

Uncoloured, unlike Timing: there is no good or bad duration — a todo open
for a week may be perfectly healthy — so it is context rather than a
verdict.

Two guards: a completion stamped *before* creation (clock skew, or a
foreign client's bad data) shows nothing rather than a negative span, and a
gap under a minute reads as "Open less than a minute" rather than
overstating the precision of two timestamps seconds apart.

### Timing

Derived by comparing `COMPLETED` against `DUE`, so it costs no extra
storage. Three outcomes, coloured with the **same semantic status tokens**
as sync status and priority rather than a third palette — and the verdict
is spelled out in words, so meaning never depends on colour alone
([ui](./ui.md) — status display):

- **Early** (green) — comfortably ahead of the deadline.
- **On time** (green) — met it. *(changed 2026-08-02: was amber. Meeting a
  deadline is meeting it; shading it as a caution nagged at something that
  went fine. Only a miss warrants a warning colour.)*
- **Late** (red) — missed it.

Rules:

- **All-day todos are judged by the day, not the instant.** `dueInstant`
  resolves `DUE;VALUE=DATE` to 23:59:59 local so an all-day todo isn't
  flagged overdue until its day is out ([ordering](#ordering-and-overdue-comparison));
  comparing against that literally would report a 3pm finish as "9 hours
  early", which is not what finishing something on its due date means.
  Completing it any time that day is on time. This keeps the footer
  consistent with the overdue flag on rows.
- **Near-misses are on time.** For a timed todo, within five minutes either
  way counts as on time — 09:01 against a 09:00 deadline was not late in
  any sense that matters.
- **Margins are rough**, in the largest useful unit ("2 hours early",
  "1 day late"). Nobody measured the gap to the minute, and exact figures
  would be precision theatre.

## Clearing completed todos

*(added 2026-08-02.)*

**There is no bulk "clear completed".** It was removed the day `COMPLETED`
started being captured, because the two cannot coexist safely: a completed
todo carries the only record that the work was ever done, and the
[Summary](./summary-view.md) view is built entirely from those records.
Deleting a list's completed section is therefore destroying history, not
tidying up — and it was a single click behind one confirm dialog.

Individual todos can still be deleted from the detail sheet, one at a time.
That is deliberate friction: losing one todo is a small mistake, losing a
quarter's worth is not.

A gated bulk action — a heavy confirmation naming what is destroyed, or a
retention policy that only offers items older than some age — is wanted, but
needs designing rather than inheriting. See
[issue #1](https://github.com/JackCuthbert/fold/issues/1).

## Moving a todo between lists

*(added 2026-08-02.)*

The detail view has a **List** dropdown alongside Priority. Choosing a
different list and saving moves the todo there; it applies on Save with
every other edit, not on selection, so nothing commits until the user does.

A move is not a property edit. A todo's list is the *collection its resource
lives in* ([lists](./lists.md)), so moving it changes the resource's URL —
unlike `PRIORITY`, which is a field inside the VTODO.

**Mechanism: copy to the target, then delete the original.** WebDAV's `MOVE`
would be atomic, and Radicale supports it across collections (verified
2026-08-02: `201`, resource byte-preserved). But cross-collection `MOVE` is
optional in WebDAV and unevenly supported by CalDAV servers, and this client
must work with any compliant one ([caldav-compliance](./caldav-compliance.md)).
Copy-then-delete uses only `PUT` and `DELETE`, which every server supports
and which the client already implements.

Rules:

- **The move is one mutation, not two.** Queuing `createTodo` and
  `deleteTodo` separately would let a failure between them strand a
  duplicate with nothing recording that the two belonged together. A single
  `moveTodo` entry keeps the pair retryable as a unit
  ([sync-and-offline](./sync-and-offline.md)).
- **Order is copy-first.** If the copy fails, nothing is lost and the todo
  stays where it was. The reverse order risks destroying the only copy.
- **The UID is preserved**, so the todo keeps its identity across the move
  and a stale reference still resolves. RFC 5545 requires UID uniqueness
  within a collection, not globally, so reusing it in the target is valid.
- **Everything else on the resource is preserved too** — the copy re-sends
  the managed properties the client knows about, so `CREATED` (and with it
  the todo's ordering position) survives.
- **A failed delete leaves a visible duplicate rather than silent loss.**
  That is the deliberate trade: the copy has already succeeded, so the
  user's todo exists; the retry will clear the original.
- **The delete step must rebase onto a fresh ETag.** Saving an edit
  alongside a move queues an update against the *same* resource ahead of
  the move, so by the time the move dispatches the source's ETag has always
  changed. Without the rebase the delete gets a 412, the move is dropped as
  fatal, and the todo is left in both lists. *(added 2026-08-02: this
  shipped briefly and was caught by moving and renaming in one save against
  live Radicale, then reading the stored `.ics` — the copy was correct and
  the original was still there under its old name.)*
- **Both steps are idempotent**, so a partially-completed move can retry
  safely: a create that 412s because the target already holds the todo is
  treated as that step's success, and a delete that 404s because the
  original is already gone is treated as complete.

## Behavior

- **Quick add:** input at the top of the todo pane; Enter adds and keeps
  focus for rapid entry. New todos get a generated UID and `DTSTAMP`.
- **Move between lists:** a List dropdown in the detail view, applied on
  Save — see [Moving a todo between lists](#moving-a-todo-between-lists).
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
  section per list with a count — see
  [Clearing completed todos](#clearing-completed-todos) for why there is no
  bulk delete.
- All mutations are optimistic and queue through the outbox
  ([sync-and-offline](./sync-and-offline.md)).
