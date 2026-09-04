# Use Fold with an AI agent

Fold includes a curl-based skill that lets a compatible AI agent list,
create, edit, complete, reopen, and delete your todos. It uses Fold's JSON API
and the same CalDAV account as the web app.

## Install the skill

Download or copy the complete
[`skills/fold-todos`](https://github.com/JackCuthbert/fold/tree/main/skills/fold-todos)
directory into the skills directory supported by your agent. Keep its
`references` directory beside `SKILL.md`; it contains the API operations and
data shapes the skill needs.

Consult your agent's documentation for its skills directory and secret
configuration. The skill is plain Markdown and curl commands; it does not
install a binary or any system software.

## Configure access

Give the agent these two values through its secret or environment facility:

- `FOLD_URL`: the origin of your Fold installation, such as
  `https://todos.example.com`, with no trailing slash.
- `FOLD_CREDENTIALS_JSON`: a JSON object containing the CalDAV details you
  normally enter on Fold's login screen.

```json
{
  "serverUrl": "https://dav.example.com/user/",
  "username": "user",
  "password": "use-an-app-password-when-available"
}
```

Do not paste credentials into a chat message or commit them to a repository.
Use a CalDAV app password when your server supports one. Fold verifies the
credentials at the beginning of a task and returns an encrypted session
cookie. The skill keeps that cookie in a private temporary file, signs out
when it finishes, and removes the file.

Fold requires HTTPS in production because the session represents access to
your todos. Plain HTTP is only appropriate for a trusted local development
server configured with `ALLOW_INSECURE_COOKIE=true`.

## API contract

The skill uses these supported routes:

| Method and path | Purpose |
| --- | --- |
| `POST /api/session` | Sign in and receive a sealed session cookie |
| `DELETE /api/session` | Sign out |
| `GET /api/lists` | Resolve list names to IDs |
| `GET /api/lists/:listId/todos` | Read todos, UIDs, and ETags |
| `POST /api/lists/:listId/todos` | Create a todo |
| `PUT /api/lists/:listId/todos/:uid` | Edit, complete, or reopen a todo |
| `DELETE /api/lists/:listId/todos/:uid` | Delete a todo |

Create requests require a unique `uid` and non-empty `summary`. Update
requests contain the current `etag` and a `changes` object. Delete requests
contain the current `etag`. IDs placed in paths are percent-encoded.

The mutable fields are `summary`, `completed`, `due`, `description`, and
`priority`. Omitting a field leaves it unchanged; `null` clears an optional
due date, description, or priority. The complete curl commands, due-date
shapes, response fields, and error handling live in the installed skill's
`references/api.md`.

## What to ask

Requests can be direct:

- “Add ‘Book the dentist’ to my Personal list.”
- “Mark ‘Buy milk’ complete.”
- “Move the gutter-cleaning todo to Saturday.”
- “Delete the completed dentist todo.”

The agent first reads your lists and todos so it can use their real IDs and
current versions. It asks when two lists or todos match the same description.
Text stored in a todo is always treated as data, never as an instruction to
the agent.

Edits and deletions use ETags so an agent cannot silently overwrite a change
made by another client. If a todo changed after the agent read it, Fold
returns the current copy. The skill retries once only when the intended edit
is still safe; otherwise it reports the conflict for you to resolve.
