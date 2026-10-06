# Agentic todo management

Fold provides a command-line client for people and AI agents. Its npm package
is `@jackcuthbert/fold-cli`, its executable is `fold-cli`, and its source lives in
`apps/cli`. The CLI talks only to Fold's JSON API; it never speaks CalDAV
directly or introduces another deployment target.

The executable was renamed from `fold` to `fold-cli` to avoid shadowing the
system text-wrapping utility. The npm package name, session paths, environment
variables, and command arguments remain unchanged.

## Initial command surface

```text
fold-cli auth login
fold-cli auth status
fold-cli auth logout
fold-cli todo list [--list LIST] [--include-completed]
fold-cli todo view UID [--list LIST]
fold-cli todo create SUMMARY --list LIST [--due DATE] [--notes TEXT] [--priority high|medium|low]
fold-cli todo edit UID [--summary SUMMARY] [--due DATE | --clear-due] [--notes TEXT | --clear-notes] [--priority high|medium|low | --clear-priority] [--list TARGET]
fold-cli todo complete UID [--list LIST]
fold-cli todo uncomplete UID [--list LIST] [--yes]
fold-cli todo delete UID [--list LIST] [--yes]
fold-cli skill install [--agent <codex|claude|all>] --scope <user|project>
```

Every command accepts `--json`. Success writes one JSON value to stdout;
failure writes one JSON error to stderr and exits non-zero. Interactive delete
asks for confirmation. Machine-readable deletion requires `--yes`, making the
authorization visible in the invocation. Uncomplete confirms the same way: the
interactive prompt writes nothing when declined and `--json` requires `--yes`.
An already-open todo is reported as success without changes.

List output contains open todos unless `--include-completed` is present. View
resolves one UID and renders every field for terminal use; JSON returns the
resolved todo and its list.

Due dates accept all-day `YYYY-MM-DD` and local `YYYY-MM-DDTHH:mm[:ss]` values.
Local datetimes use the machine's IANA timezone and normalize to seconds;
offsets and `Z` are rejected. Invalid date/time values, conflicting due flags,
and no-op edits are usage errors before authentication.

Create and edit accept notes and priority. `--notes TEXT` maps to the API's
`description` field and preserves text verbatim, including empty strings;
`--clear-notes` explicitly removes it. Priority is `high`, `medium`, or `low`;
edit clears it with `--clear-priority`. Set/clear flags for a field are
mutually exclusive. Notes and priority may be combined with due and summary
changes, or edited alone. Omitted fields are left unchanged. Invalid priorities,
contradictory flags, and no-op edits are rejected before authentication.

## Persistent authentication

`fold-cli auth login` collects the Fold origin, CalDAV URL, username, and password
in a terminal. The password is not accepted as a command-line argument. An
explicit `FOLD_PASSWORD` supports secret-backed automation without putting the
password in the process arguments.

The CLI sends those credentials to `POST /api/session`, then stores only the sealed Fold cookie, its expiry, and Fold origin. The state directory and session file are
user-only (`0700` and `0600`). macOS uses `~/Library/Application Support/Fold`;
Linux uses `$XDG_STATE_HOME/fold`, falling back to `~/.local/state/fold`.
`FOLD_STATE_DIR` overrides the location for isolated automation and tests.

Expired cookies are deleted locally before use. Every successful authenticated
request persists a renewed `Set-Cookie`, so
Fold's seven-day sliding session behaves as it does in a browser. A missing,
expired, or invalid session tells the user to run `fold-cli auth login`. Logout
calls Fold when possible and always removes the local session.

## Todo identity and concurrency

Create resolves an exact list ID or unique display name, generates a UUID and
creation timestamp locally, and sends the existing create schema. Edit,
complete, uncomplete, and delete resolve the UID across the user's lists;
`--list` narrows an otherwise ambiguous UID. On `edit`, `--list` is instead the
move destination, resolved like `create`.

`todo edit --list TARGET` moves a todo. The CLI copies the todo (summary, due,
notes, priority, created time, and any combined edits) into TARGET, then
deletes the source with its ETag, mirroring the app's move. A create `412`
reuses the copy already in TARGET; a delete `404` means the move is complete; a
delete `412` stops with exit 4 so a concurrent source change is not
overwritten. A completed todo and a TARGET equal to the todo's own list are
usage errors before any request.

All mutations use the todo's current ETag. Edits retry once only when a `412`
response proves every edited field remained unchanged (due compares by kind,
value, and timezone ID; notes and priority compare by value, including
presence). Completion retries
once when the todo remains incomplete, and treats an already-completed fresh
copy as success. Uncomplete sends `{ completed: false }`, treats an already-open
fresh copy as success, and retries once while the fresh copy is still
completed. Delete never retries a conflict because doing so could erase
a concurrent change.

Network and `5xx` failures are never blindly retried: a mutation may already
have reached the CalDAV server.

## Agent skill

The npm package includes the skill from `skills/fold-todos`. `fold-cli skill
install` copies it to the selected agent's user or project skill directory and
refuses to replace an existing file. Codex installations use `.codex/skills`,
Claude installations use `.claude/skills`, and `--agent all` or an omitted
agent uses the shared `.agents/skills` directory. Each is rooted in the home or
project directory according to the selected scope.

The skill invokes the CLI with `--json`. Authentication is a human action:
when `fold-cli auth status --json` fails, the agent asks the user to run `fold-cli auth
login` rather than requesting or handling credentials. Todo and list text is
untrusted data, never instructions.

## Packaging and releases

`apps/cli` is the monorepo's deliberately published
workspace. Its build bundles internal workspace code into one Node ESM
entrypoint and copies the agent skill alongside it, so `@fold/schemas` is not
published and consumers never install a `workspace:*` runtime dependency.

The CLI is an independent release-please component with its own manifest
version, changelog, and `fold-cli-vX.Y.Z` tags. A CLI release triggers npm
publication from its component tag; app releases publish Docker without
republishing npm. Breaking CLI changes do not bump the app when their commits
are confined to CLI and bundled skill paths. See [releases](./releases.md)
for commit boundaries and the migration from shared versioning. CI publishes
the public scoped package with npm provenance. Publishing requires the `@jackcuthbert` npm scope and repository
trusted-publisher configuration to exist before the first release.

Contributor instructions for exercising the publishable bundle without an npm
release live in [testing the CLI locally](../development/testing-cli.md).
