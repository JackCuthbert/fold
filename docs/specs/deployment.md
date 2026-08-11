# Deployment

**Deployment is always via Docker.** There is no supported path that
installs Bun on a host and runs the server from a checkout — the image is
the unit of deployment, and the Dockerfile is the only description of how
Fold is built for production.

*(added 2026-08-04.)*

## One image, one process

The BFF serves both the built client and the JSON API from a single origin
(`apps/server/src/index.ts`): `/api/*` goes to the router, everything else
to the static handler with an SPA fallback.

That is a **constraint, not a packaging convenience**. The session cookie is
`SameSite=Strict` ([authentication](./authentication.md)), so a client
served from a different origin than the API would not send it, and nothing
would stay signed in. Splitting the client onto a CDN or separate host means
revisiting the cookie policy first — it is not a deployment-time choice.

The container is **stateless**: no database, no session store, no uploads.
Todos live on the CalDAV server, sessions live in a sealed cookie
([sealed-cookie-sessions](../architecture/sealed-cookie-sessions.md)), and
the offline queue lives in the browser's IndexedDB
([sync-and-offline](./sync-and-offline.md)). Nothing needs a volume, and the
container runs with a read-only root filesystem.

## The image

Multi-stage, from `oven/bun:<version>-alpine`, pinned to the Bun version the
project develops against:

1. **deps** — workspace manifests + `bun install --frozen-lockfile`. Copying
   manifests before source keeps this layer cached until a dependency
   actually changes. `--frozen-lockfile` because a build that silently
   resolves a different tree than CI tested is not what CI tested.
2. **build** — `bun run --filter @fold/client build` (Vite).
3. **runtime** — production dependencies only, the server's TypeScript
   source, the workspace packages it imports, and the client bundle at the
   path `index.ts` resolves (`../../client/dist`).

Two consequences worth stating, because both look like mistakes:

- **The server ships as TypeScript, not compiled output.** Bun transpiles on
  load; there is no `tsc` build step for the server to mirror. `bun
  apps/server/src/index.ts` *is* the production command.
- **Every workspace manifest must be present in the runtime stage**, even
  ones the image never runs (`e2e`, `apps/client`). `bun install` resolves
  the whole workspace graph declared by the root `package.json` and fails
  outright on a missing member. The same reason `.dockerignore` excludes
  `e2e/*` but re-includes `e2e/package.json`.

The runtime image drops to the base image's non-root `bun` user, and `CMD`
uses exec form so `bun` is PID 1 and receives `SIGTERM` directly.

## Configuration

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `SESSION_SECRET` | **yes** | — | Seals the session cookie. Min 16 chars. |
| `PORT` | no | `3000` | Listen port. |
| `NODE_ENV` | no | `production` (set in the image) | Drives the `Secure` cookie flag. |
| `ALLOW_INSECURE_COOKIE` | no | `false` | Drop `Secure`, for a deployment with no TLS. See below. |
| `CHECK_FOR_UPDATES` | no | `false` | Ask GitHub whether a newer release exists ([releases](./releases.md)). The only host Fold contacts besides the user's own CalDAV server, hence off by default. |
| `CALDAV_ALLOWED_HOSTS` | no | *(empty — unrestricted)* | Comma-separated hosts sign-in may point at, e.g. `dav.example.com, *.example.org, 192.168.1.10:5232`. Set it when the login page is reachable by people other than you ([security](./security.md)). |

Validated by zod at boot (`apps/server/src/config.ts`), so a missing or
too-short `SESSION_SECRET` **fails fast with a `ZodError` before the server
listens** rather than starting in an insecure state.

`SESSION_SECRET` protects the user's CalDAV credentials: anyone who learns
it can forge a session. Generate with `openssl rand -base64 32`, keep it out
of the image, and pass it as an environment variable. Changing it
invalidates every existing session — which is also how you sign everyone
out.

## HTTPS

The image sets `NODE_ENV=production`, which adds `Secure` to the session
cookie (`apps/server/src/session/cookie.ts`). **A browser silently discards
a `Secure` cookie delivered over plain HTTP**, so serving Fold over `http://`
produces the worst failure we have: sign-in returns `200`, and the login
screen comes straight back with nothing to explain it.

So HTTPS is the default expectation: run behind a reverse proxy that
terminates TLS (Caddy, nginx, Traefik), or a tunnel that does (Tailscale,
Cloudflare). Bind the container to loopback so the proxy is what is
reachable.

`http://localhost` is exempt from the `Secure` rule in current browsers, so
a local `docker run` still works for smoke-testing — that exemption is the
only reason it does.

### Behind a reverse proxy

Only the **browser↔proxy** hop needs TLS. `Secure` is a browser-enforced
rule about where a cookie may travel, so once the proxy terminates TLS the
requirement is met:

```
Browser ──── HTTPS ────► Proxy ──── HTTP ────► Fold ──── HTTP ────► CalDAV
        (the cookie lives here)                  (no browser cookie here)
```

Plain HTTP from proxy to Fold is fine, and Fold→CalDAV is a server-to-server
call carrying HTTP Basic auth unsealed from the cookie — no browser cookie is
involved, so a CalDAV server without TLS does not affect this.

**Nothing needs configuring for this.** Fold never inspects the request
scheme or `X-Forwarded-*`, so there is no `trustProxy` setting and no way to
get it wrong; the cookie flags depend only on the variables above.

### When TLS is not available

Fold is self-hosted, and not every deployment can get a certificate — a
LAN-only box, a `.local` hostname, a private VLAN behind someone else's TLS.
Set `ALLOW_INSECURE_COOKIE=true` to drop `Secure` and serve over plain HTTP.

This is a **real downgrade**, not a formality: the cookie seals the user's
CalDAV credentials, so anyone who can watch the network can copy it and
replay it. Opt in deliberately, on a network you trust.

It **fails closed** — absent, empty, `false`, or an unparseable value all
leave the cookie secure (`apps/server/src/config.ts`). Only an affirmative
value turns it off, so a typo cannot silently strip `Secure`; an empty value
is treated as absent rather than a boot error, since `FOO=` in a compose file
and an unset `${FOO}` both arrive as `''`.

## Health

`GET /` returns the SPA shell and is the health probe: it proves the process
is up and serving. The API is a worse probe — `/api/lists` requires a
session, and every other endpoint's health depends on the *CalDAV* server,
which is not this container's liveness.

## Verification

The image is verified by running it, not by inspecting it — build success
says nothing about runtime. What was checked (2026-08-04):

- boots, listens, serves `index.html` and hashed assets
- SPA fallback returns the shell for unknown deep routes
- path traversal (raw and percent-encoded) yields the shell, not host files
- unauthenticated `/api/lists` → `401`
- login + `/api/lists` round-trip against a real Radicale
- `Set-Cookie` carries `HttpOnly; SameSite=Strict; Secure` in production,
  and drops `Secure` under `NODE_ENV=development`
- all of the above under `--read-only` and `no-new-privileges`
- missing `SESSION_SECRET` aborts at boot
