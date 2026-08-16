# Running a local CalDAV server

To try the app without pointing it at a real server, `compose.yml` starts a
Radicale instance with a test account.

```bash
docker compose up -d
```

Then start the app and sign in with:

| Field | Value |
|---|---|
| Server URL | `http://localhost:5232/testuser/` |
| Username | `testuser` |
| Password | `testpass` |

Note the **trailing slash** and the username in the path — that's the
collection Radicale owns for this account.

## What you get

- Data persists in `./radicale-data/` between restarts, so you can add
  todos, `docker compose restart`, and find them still there. That
  directory is gitignored.
- Radicale's own web interface is at http://localhost:5232/ (same
  credentials) if you want to confirm what actually landed on the server.
- Authentication is real (bcrypt htpasswd), so this exercises the login
  form and the encrypted session cookie — not just the happy path.

## Testing offline behaviour

The interesting part of this app is what happens when the server goes away
(see [Working offline](https://jackcuthbert.github.io/fold/offline) in the user guide):

```bash
docker compose stop     # server disappears
```

Keep using the app — add todos, tick things off. The status dot at the
bottom of the sidebar, next to **Settings**, turns red and pulses; the
banner at the bottom of the screen still shows the queued count
(`Syncing N changes`). Then:

```bash
docker compose start    # server returns
```

Queued changes replay automatically. Radicale's web interface will show
them.

To simulate losing the *network* rather than the server, use your browser
devtools' offline mode instead — the app distinguishes the two ([Working offline](https://jackcuthbert.github.io/fold/offline)
explains how).

## Resetting

```bash
docker compose down
rm -rf radicale-data
```

## This is for local testing only

The config has no TLS and a password committed to the repository. Don't
expose it beyond localhost or reuse the credentials anywhere. For a real
deployment, run Radicale (or any spec-compliant CalDAV server) behind
HTTPS with your own credentials.
