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
