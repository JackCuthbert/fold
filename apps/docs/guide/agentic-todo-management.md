# Use Fold from a terminal or AI agent

Fold's command-line client lets you create, edit, complete, and delete todos
without opening the web app. It also gives AI agents a small, predictable
interface without exposing your CalDAV password to their prompts.

## Install

Install Node.js 20 or newer, then:

```sh
npm install --global @jackcuthbert/fold-cli
```

This installs the `fold-cli` command. The package contains ordinary JavaScript and
has no platform-specific native dependencies, so the same installation works
on macOS and Linux, on Intel and ARM machines.

## Sign in once

```sh
fold-cli auth login
```

Enter the Fold URL and the CalDAV details you normally enter on Fold's login
screen. The password is hidden while you type. The CLI sends it to Fold only
for login and does not save it.

The saved file contains Fold's encrypted session cookie. It is readable only
by your user account and is renewed as you use the CLI, just like the cookie
in a browser. Sign in again after seven days without use or when the Fold operator changes
`SESSION_SECRET`.

Check or end the session with:

```sh
fold-cli auth status
fold-cli auth logout
```

## Manage todos

```sh
fold-cli todo list
fold-cli todo list --include-completed
fold-cli todo view TODO_UID
fold-cli todo create "Book dentist" --list Personal
fold-cli todo create "Submit report" --list Work --due 2026-10-05
fold-cli todo create "Renew passport" --list Personal --notes "Bring photo" --priority high
fold-cli todo edit TODO_UID --summary "Book dentist appointment" --due 2026-10-05T09:30
fold-cli todo edit TODO_UID --notes "Ask for Dr. Lee" --priority medium
fold-cli todo edit TODO_UID --clear-due --clear-notes --clear-priority
fold-cli todo complete TODO_UID
fold-cli todo delete TODO_UID
```

List hides completed items unless `--include-completed` is present. View shows
the selected todo's summary, description, status, scheduling fields, stable
identity, and sync metadata.

Create prints the new todo's UID in JSON mode. Edit, complete, and delete can
search every list for that UID; add `--list Personal` if Fold reports an
ambiguity. Delete asks for confirmation before it changes anything.

Add `--json` to receive machine-readable output. Non-interactive deletion also
requires `--yes`:

```sh
fold-cli todo list --json
fold-cli todo create "Book dentist" --list Personal --json
fold-cli todo complete TODO_UID --json
fold-cli todo delete TODO_UID --yes --json
```

Due dates accept all-day `YYYY-MM-DD` or local `YYYY-MM-DDTHH:mm[:ss]`
datetimes. Local times use the machine's IANA timezone; offsets and `Z` are
rejected. Create accepts `--notes TEXT` and `--priority high|medium|low`,
independently or together with `--due`. Edit accepts the same set flags and
`--clear-notes` / `--clear-priority` to remove those values. Set and clear flags
for one field cannot be combined. Notes are preserved verbatim, including empty
text; use `--clear-notes` to remove them. Edits may combine notes and priority
with summary and due, and notes-only or priority-only edits are valid. Omitted
fields remain unchanged. Invalid values, contradictory flags, and no-op edits
are rejected before authentication. The CLI uses ETags: an edit retries once
only if every edited field is unchanged on the fresh todo (due compares by kind,
value, and timezone ID; notes and priority compare by value and presence);
completion can retry once. Delete conflicts stop for review.

## Connect an AI agent

Install the bundled skill for the agent and scope you use:

```sh
# Available to Codex in every project
fold-cli skill install --agent codex --scope user

# Available to Claude Code in the current project
fold-cli skill install --agent claude --scope project
```

Run a separate command for each agent or scope where you want the skill. The
installer does not replace an existing skill. Sign in yourself with `fold-cli auth
login`; the skill never asks for or handles your password.

The agent uses `--json`, treats the content of todos as data rather than
instructions, and asks before an ambiguous or unauthorized destructive
operation.

## Migrating from the `fold` command

The executable is now `fold-cli` to avoid conflicting with the system's
`fold` text-wrapping command. After the release is published, replace the old
installation so its `fold` executable is removed:

```sh
npm uninstall --global @jackcuthbert/fold-cli
npm install --global @jackcuthbert/fold-cli@latest
fold-cli auth status
```

Use the package manager and installation scope used for your original install.
Replace `fold` with `fold-cli` in scripts, shell aliases, and agent instructions;
remove aliases or symlinks that make `fold` invoke the Fold CLI. Subcommands,
flags, environment variables, and saved session locations are unchanged, so
an unexpired session still works without signing in again.

Previously installed agent skills still invoke `fold`. Update their commands
or move the existing `SKILL.md` outside its skill directory as a backup, then reinstall
with `fold-cli skill install` using the same `--agent` and `--scope`. The
installer refuses to overwrite an existing file. Skill directories are
`.codex/skills/fold-todos`, `.claude/skills/fold-todos`, or
`.agents/skills/fold-todos`, under your home directory for user scope or the
project for project scope. Repeat for every installed agent and scope, and
restart the agent session to load the updated instructions.
