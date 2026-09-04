# Use Fold from a terminal or AI agent

Fold's command-line client lets you create, edit, complete, and delete todos
without opening the web app. It also gives AI agents a small, predictable
interface without exposing your CalDAV password to their prompts.

## Install

Install Node.js 20 or newer, then:

```sh
npm install --global @jackcuthbert/fold-cli
```

This installs the `fold` command. The package contains ordinary JavaScript and
has no platform-specific native dependencies, so the same installation works
on macOS and Linux, on Intel and ARM machines.

## Sign in once

```sh
fold auth login
```

Enter the Fold URL and the CalDAV details you normally enter on Fold's login
screen. The password is hidden while you type. The CLI sends it to Fold only
for login and does not save it.

The saved file contains Fold's encrypted session cookie. It is readable only
by your user account and is renewed as you use the CLI, just like the cookie
in a browser. After seven days without use—or after the Fold operator changes
`SESSION_SECRET`—sign in again.

Check or end the session with:

```sh
fold auth status
fold auth logout
```

## Manage todos

```sh
fold todo list
fold todo list --include-completed
fold todo view TODO_UID
fold todo create "Book dentist" --list Personal
fold todo edit TODO_UID --summary "Book dentist appointment"
fold todo complete TODO_UID
fold todo delete TODO_UID
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
fold todo list --json
fold todo create "Book dentist" --list Personal --json
fold todo complete TODO_UID --json
fold todo delete TODO_UID --yes --json
```

The CLI uses ETags to avoid silently replacing changes from another client.
It can safely merge a non-conflicting summary edit or completion once. A
delete conflict stops so you can inspect what changed.

## Connect an AI agent

Download or copy
[`skills/fold-todos`](https://github.com/JackCuthbert/fold/tree/main/skills/fold-todos)
into the skills directory supported by your agent. Sign in yourself with
`fold auth login`; the skill never asks for or handles your password.

The agent uses `--json`, treats the content of todos as data rather than
instructions, and asks before an ambiguous or unauthorized destructive
operation.
