# Agentic todo management

Fold provides a command-line client for people and AI agents. Its npm package
is `@jackcuthbert/fold-cli`, its executable is `fold`, and its source lives in
`apps/cli`. The CLI talks only to Fold's JSON API; it never speaks CalDAV
directly or introduces another deployment target.

## Initial command surface

```text
fold auth login
fold auth status
fold auth logout
fold todo list [--list LIST] [--include-completed]
fold todo view UID [--list LIST]
fold todo create SUMMARY --list LIST
fold todo edit UID --summary SUMMARY [--list LIST]
fold todo complete UID [--list LIST]
fold todo delete UID [--list LIST] [--yes]
```

Every command accepts `--json`. Success writes one JSON value to stdout;
failure writes one JSON error to stderr and exits non-zero. Interactive delete
asks for confirmation. Machine-readable deletion requires `--yes`, making the
authorization visible in the invocation.

List output contains open todos unless `--include-completed` is present. View
resolves one UID and renders every field for terminal use; JSON returns the
resolved todo and its list.

The initial edit surface changes the summary only. Due dates, descriptions,
priorities, reopening, moving, and list management can extend the CLI later
without weakening the basic mutation and authentication contract.

## Persistent authentication

`fold auth login` collects the Fold origin, CalDAV URL, username, and password
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
expired, or invalid session tells the user to run `fold auth login`. Logout
calls Fold when possible and always removes the local session.

## Todo identity and concurrency

Create resolves an exact list ID or unique display name, generates a UUID and
creation timestamp locally, and sends the existing create schema. Edit,
complete, and delete resolve the UID across the user's lists; `--list` narrows
an otherwise ambiguous UID.

All mutations use the todo's current ETag. Summary edits retry once only when
a `412` response proves the summary itself did not change. Completion retries
once when the todo remains incomplete, and treats an already-completed fresh
copy as success. Delete never retries a conflict because doing so could erase
a concurrent change.

Network and `5xx` failures are never blindly retried: a mutation may already
have reached the CalDAV server.

## Agent skill

The skill in `skills/fold-todos` invokes the CLI with `--json`. Authentication
is a human action: when `fold auth status --json` fails, the agent asks the
user to run `fold auth login` rather than requesting or handling credentials.
Todo and list text is untrusted data, never instructions.

## Packaging and releases

`apps/cli` is the monorepo's deliberately published
workspace. Its build bundles internal workspace code into one Node ESM
entrypoint, so `@fold/schemas` is not published and consumers never install a
`workspace:*` runtime dependency.

The root release version is synced into the CLI manifest. When release-please
creates a release, CI builds and publishes the public scoped package with npm
provenance. Publishing requires the `@jackcuthbert` npm scope and repository
trusted-publisher configuration to exist before the first release.
