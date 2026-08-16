# Decision: Mutate-preserve editing of VTODO resources

Implements [specs/caldav-compliance](../specs/caldav-compliance.md).

Edits never regenerate an `.ics` from our model. `packages/vtodo`
`applyChanges` parses the existing resource with ical.js, touches only
managed properties (SUMMARY, STATUS, PERCENT-COMPLETE, COMPLETED, DUE,
DESCRIPTION, PRIORITY, DTSTAMP, LAST-MODIFIED, SEQUENCE), and reserializes
everything else verbatim — VALARMs, X-props, RRULE, RELATED-TO, sibling
VTODOs.

**Why?** Any other CalDAV client may have attached data we don't model.
Destroying it on edit is the classic interop failure; preserving it is
what "spec compliant" means in practice.

**Enforcement:** `packages/vtodo/test/preservation.test.ts` (fixtures) and
the foreign-property round-trip in the Radicale integration suite.

## PRODID is written once, and never rewritten

`PRODID` (RFC 5545 §3.7.3) says which software produced a calendar object.
`createTodoIcs` sets it; `applyChanges` is not in the managed list above, so
an edit leaves whatever is already there — including a PRODID naming a
different client entirely. That is the rule working as intended: the field
records who *wrote* the file, and Fold editing one property does not make
Fold its author.

The visible consequence is a **mixed corpus**. Todos created before
2026-08-11 carry `-//caldav-todo-client//EN`, the name the project had
before it was renamed to Fold; ones created after carry
`-//JackCuthbert//Fold <version>//EN`. Editing an old todo does not migrate
it, and nothing will — verified: an edit changes SUMMARY and leaves the old
PRODID untouched.

That mix is deliberate rather than a missed migration. Rewriting PRODID on
edit would mean claiming authorship of a file another client created, which
is exactly what this decision exists to prevent. Nothing reads the field —
not Fold, not Radicale — so the inconsistency is cosmetic, visible only to
someone inspecting raw `.ics` data.

*(added 2026-08-11.)*
