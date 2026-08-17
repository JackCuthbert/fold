# Installing Fold

Fold runs as a single Docker container. It keeps no database and stores
nothing between restarts, so there is nothing to back up and one setting to
configure.

You need Docker, somewhere to run it, and a CalDAV server you already use.

## The short version

Create a `compose.yml`:

```yaml
services:
  fold:
    image: ghcr.io/jackcuthbert/fold:latest
    restart: unless-stopped
    ports:
      - '127.0.0.1:3000:3000'
    environment:
      # Generate one with: openssl rand -base64 32
      SESSION_SECRET: 'replace-me'
```

Then start it:

```bash
docker compose up -d
```

Fold is now listening on `127.0.0.1:3000`. Put a reverse proxy in front of
it (see [HTTPS](#https) below), open it in a browser, and sign in with your
CalDAV server URL, username and password.

## SESSION_SECRET

This is the one setting you must provide. It encrypts the cookie that holds
your CalDAV credentials.

- **Keep it private.** Anyone holding it can forge a session.
- **Changing it signs everyone out.** Existing cookies can no longer be
  opened, which is a reasonable way to force a sign-out everywhere.
- It must be at least 16 characters. `openssl rand -base64 32` gives you a
  good one.

## HTTPS

**Use it.** The session cookie carries your CalDAV credentials, so the
connection needs to be private.

There is also a practical reason. Fold marks the cookie `Secure`, and
browsers silently drop a `Secure` cookie sent over plain HTTP. Sign-in
appears to work and then bounces you straight back to the login screen,
with nothing in the interface explaining why.

Any reverse proxy will do. With [Caddy](https://caddyserver.com) it is two
lines, and certificates are handled for you:

```caddyfile
fold.example.com {
	reverse_proxy 127.0.0.1:3000
}
```

Only the hop between your browser and the proxy needs TLS. Fold talks to
your CalDAV server separately, and that connection is unaffected.

### On a trusted network with no TLS

Set `ALLOW_INSECURE_COOKIE=true` to drop the `Secure` flag so plain HTTP
works.

Understand the trade first: anyone who can watch that network can copy the
cookie and use your CalDAV account. Only do this where you trust every
device on the network.

## Upgrading

```bash
docker compose pull && docker compose up -d
```

Nothing migrates and nothing is lost, because Fold stores nothing. Your
todos live on your CalDAV server, and your queued offline changes live in
your browser.

Pin a version if you would rather upgrade deliberately:

| Tag | Follows |
|---|---|
| `latest` | Every release |
| `1` | Every 1.x release, stopping before a breaking change |
| `1.0` | Patches to 1.0 only |
| `1.0.0` | Exactly this version |

`1` is usually the one worth pinning to.

## Optional settings

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `3000` | The port Fold listens on |
| `ALLOW_INSECURE_COOKIE` | `false` | Drops the `Secure` cookie flag, for a deployment with no TLS |
| `CALDAV_ALLOWED_HOSTS` | *(unrestricted)* | Limits which CalDAV servers sign-in may reach |
| `CHECK_FOR_UPDATES` | `false` | Asks GitHub whether a newer release exists |

### Restricting which servers Fold will reach

By default Fold connects to whatever server URL is typed into the login
form, which is what makes it work with everyone's setup. If your login page
is reachable by people other than you, name the servers it should accept:

```yaml
CALDAV_ALLOWED_HOSTS: 'dav.example.com, *.example.org, 192.168.1.10:5232'
```

Anything else is refused before a request leaves the server.

### Update checks

Fold does not contact anything except your CalDAV server unless you ask it
to. Set `CHECK_FOR_UPDATES=true` and it will also ask GitHub whether a
newer release exists, and show a quiet note when there is one.

## Where your credentials go

Worth knowing before you hand Fold a password: **it never stores one.**
There is no user table and no session store.

When you sign in, your credentials are checked against your CalDAV server,
then encrypted into a cookie that only your Fold instance can open. Your
browser holds that cookie; scripts on the page cannot read it. Each request
unseals it in memory, talks to your server, and discards it.

That is why restarting the container loses nothing. There is no state to
lose.

## No CalDAV server yet?

You need one, since Fold is a client rather than a service. [Radicale](https://radicale.org)
is small and easy to self-host; [Nextcloud](https://nextcloud.com) and
[Baïkal](https://sabre.io/baikal/) also work, as does anything else that
implements the standard properly.

Once it is running, [getting started](./getting-started.md) covers signing
in.
