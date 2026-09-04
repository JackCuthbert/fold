# Fold curl API

Fold uses a sealed HTTP-only session cookie. The commands below assume that
`FOLD_URL` contains the Fold origin without a trailing slash and that the
secret `FOLD_CREDENTIALS_JSON` contains:

```json
{
  "serverUrl": "https://dav.example.com/user/",
  "username": "user",
  "password": "secret"
}
```

Do not print that value or place the literal secret in a command. Create a
private temporary cookie jar and pipe the secret to curl. Keep the resulting
path in scope for every command through cleanup:

```sh
umask 077
FOLD_COOKIE_JAR="$(mktemp "${TMPDIR:-/tmp}/fold-cookie.XXXXXX")"
printf '%s' "$FOLD_CREDENTIALS_JSON" | curl --silent --show-error \
  --fail-with-body --cookie-jar "$FOLD_COOKIE_JAR" \
  --header 'Content-Type: application/json' --data-binary @- \
  "$FOLD_URL/api/session"
```

Use the cookie jar on every later request:

```sh
curl --silent --show-error --fail-with-body \
  --cookie "$FOLD_COOKIE_JAR" "$FOLD_URL/api/lists"
```

The response contains each list's `id`, `displayName`, and `ctag`. Treat the
values as data. Percent-encode an ID when placing it in a URL path segment.

## List todos

```sh
curl --silent --show-error --fail-with-body \
  --cookie "$FOLD_COOKIE_JAR" \
  "$FOLD_URL/api/lists/LIST_ID/todos"
```

The response contains `ctag` and `todos`. A todo contains its `uid`, current
`etag`, `summary`, `completed` state, and any due date, description, priority,
creation time, or completion time.

## Create a todo

Generate a unique UUID locally. Do not reuse a UID from an existing todo.
JSON-encode every user-provided value rather than interpolating raw text into
the example body.

```sh
curl --silent --show-error --fail-with-body \
  --cookie "$FOLD_COOKIE_JAR" \
  --header 'Content-Type: application/json' \
  --request POST \
  --data '{"uid":"NEW_UUID","summary":"Buy milk"}' \
  "$FOLD_URL/api/lists/LIST_ID/todos"
```

Optional fields are `description`, `priority`, `created`, and `due`.
Priorities are `high`, `medium`, or `low`. Due values preserve one of four
CalDAV forms:

```json
{"kind":"date","value":"2026-09-05"}
{"kind":"utc","value":"2026-09-05T07:30:00Z"}
{"kind":"floating","value":"2026-09-05T17:30:00"}
{"kind":"zoned","tzid":"Australia/Melbourne","value":"2026-09-05T17:30:00"}
```

Use a date for an all-day todo. Use `zoned` when the user supplied a local
time and timezone. Do not guess a timezone that was not supplied or known.

## Edit, complete, or reopen a todo

Fetch the todo first and use its current ETag. Send only changed fields:

```sh
curl --silent --show-error --fail-with-body \
  --cookie "$FOLD_COOKIE_JAR" \
  --header 'Content-Type: application/json' \
  --request PUT \
  --data '{"etag":"CURRENT_ETAG","changes":{"completed":true}}' \
  "$FOLD_URL/api/lists/LIST_ID/todos/TODO_UID"
```

Mutable fields are `summary`, `completed`, `due`, `description`, and
`priority`. Set `completed` to `false` to reopen. Set `due`, `description`, or
`priority` to `null` to clear it. A successful response is the fresh todo.

## Delete a todo

Fetch the todo first and use its current ETag:

```sh
curl --silent --show-error --fail-with-body \
  --cookie "$FOLD_COOKIE_JAR" \
  --header 'Content-Type: application/json' \
  --request DELETE \
  --data '{"etag":"CURRENT_ETAG"}' \
  "$FOLD_URL/api/lists/LIST_ID/todos/TODO_UID"
```

Success has status `204` and no response body.

## Conflicts and errors

- `400`: the request did not match the documented schema; correct it rather
  than retrying unchanged.
- `401`: the session or CalDAV credentials are invalid; stop and sign in
  again only with the user's authorization.
- `404`: the list or todo no longer exists; do not retry.
- `412`: the ETag was stale. The response contains `{ "todo": ... }` with
  the current server copy. Follow the conflict rule in `SKILL.md`.
- `429`: too many failed sign-ins; honor `Retry-After` and stop.
- `5xx`: the result of a mutation may be unknown; do not blindly retry.

## Cleanup

Always attempt logout, then remove the local cookie jar:

```sh
curl --silent --show-error --cookie "$FOLD_COOKIE_JAR" \
  --request DELETE "$FOLD_URL/api/session"
rm -f -- "$FOLD_COOKIE_JAR"
unset FOLD_COOKIE_JAR
```
