# Security

What the server asserts about itself to the browser, and which threats
that does and does not address.

*(added 2026-08-11, from the pre-public security audit — issue #43.)*

## Response headers

Every response — API and static alike — carries the same set. They are
applied at the single seam in `apps/server/src/index.ts` where both paths
meet, rather than inside the router and the static handler separately: two
call sites is two chances for a later branch to return early and miss them.

| Header | Value |
|---|---|
| `Content-Security-Policy` | see below |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `no-referrer` |
| `X-Frame-Options` | `DENY` |

`Referrer-Policy` is not boilerplate here. A self-hosted deployment's
hostname is itself identifying — `todos.my-surname.example` in a `Referer`
tells any third party the user reaches exactly who they are. Nothing in
Fold needs a referrer, so none is sent.

An existing header always wins: `withSecurityHeaders` fills gaps and never
overwrites something a handler set deliberately.

## The Content-Security-Policy

```
default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data:; font-src 'self'; connect-src 'self';
manifest-src 'self'; base-uri 'none'; form-action 'none';
frame-ancestors 'none'
```

A policy this strict is affordable because of how Fold is already built:
one origin serving both the client and the API, no CDN, no analytics, and
self-hosted fonts (docs/specs/themes.md). Most apps have to allowlist three
or four hosts before they start.

`default-src 'none'` leads, so a directive nobody thought to add fails
closed rather than inheriting `*`.

- **`script-src 'self'`** — no `'unsafe-inline'`, no `'unsafe-eval'`. Vite
  emits the bundle as an external module, so there is no inline script to
  allow. This is the directive doing the real work: it is what turns an
  injected `<script>` into a no-op.
- **`style-src 'self' 'unsafe-inline'`** — the one concession. Styling is
  CSS Modules, but three components set a `style` attribute for a value
  only known at runtime: a list's colour (`color-picker`, `view-header`)
  and a typeface preview's font stack (`typeface-choice`). React renders
  those inline, which CSP counts here. It is a real weakening, though a far
  smaller one than for scripts — it permits restyling, not execution — and
  removing it means threading a nonce through render or dropping per-list
  colours. Revisit if those three uses ever go.
- **`connect-src 'self'`** — the browser only ever calls this origin. The
  CalDAV server is reached by the BFF, never by the page, which is the
  whole point of the BFF (docs/specs/overview.md).
- **`base-uri 'none'`** — an injected `<base>` can re-point every relative
  URL on the page, including the script `src`.
- **`form-action 'none'`** — every form here is handled in JS; nothing
  submits natively. This stops an injected form exfiltrating to an
  attacker's host.
- **`frame-ancestors 'none'`** — clickjacking. Supersedes
  `X-Frame-Options`, which is sent as well for browsers predating it.

### Verified, not assumed

A CSP that is present but not enforcing looks identical to one that works.
Confirmed in a real browser against the built client: an injected inline
script, a third-party script and a third-party tracking pixel were each
blocked with a `securitypolicyviolation` event —

```
script-src-elem  inline
script-src-elem  https://evil.example.com/x.js
img-src          https://evil.example.com/pixel.png
```

— while sign-in, sync, list colours, the palette picker and the typeface
previews all rendered and worked normally.

## HSTS is deliberately absent

`Strict-Transport-Security` is **not** sent, and should not be added here.

`ALLOW_INSECURE_COOKIE` exists because a LAN-only or `.local` deployment
may have no certificate at all (`apps/server/src/config.ts`). An HSTS
header pins that browser to HTTPS for the whole `max-age`, locking the user
out of their own install with no way to undo it from the app.

HTTPS belongs to whatever terminates TLS in front of Fold, and so does
HSTS. An operator running Fold behind a reverse proxy with a real
certificate should set it there.

## The sign-in attempt cap

`POST /api/session` is the only route that acts on an **unauthenticated**
caller's instructions: it takes a `serverUrl` and credentials from whoever
asks, and goes and tries them. That makes Fold usable as an anonymous
credential-testing relay positioned inside the network the container runs
on — the attacker's own address never reaches the CalDAV server, so its
rate limiting and its logs see only Fold.

After **5 failed attempts** against one target, further attempts are
refused with `429` and a `Retry-After` for **15 minutes**.

- **The slot is taken before the upstream call, not after it fails.** This
  is the difference between a cap that works and one that looks like it
  does. Counting on failure leaves every request in a concurrent burst
  reading the counter before any has written to it: measured against the
  first implementation, **40 parallel guesses all reached the CalDAV
  server** past a cap of 5. Reserving up front, the same burst gets 5
  through and 35 refused. An in-flight attempt therefore holds a slot,
  which `release` hands back when the attempt proved nothing.
- **Keyed per target** — an opaque FNV-1a hash of the normalized server URL
  plus the username, so one locked account never affects another. Hashed,
  not stored raw, because this map is process state that can reach a heap
  dump: the same reasoning that keeps the URL and username out of the
  access log (docs/specs/observability.md).
- **Only credential rejections keep the slot.** A `401` from CalDAV keeps
  it; an unreachable or slow server gets it back. A server that is merely
  down says nothing about whether the password was right, and holding
  those against the user would let an outage lock out the very person
  waiting for it to recover.
- **Success forgives.** A correct sign-in clears the counter, so someone
  who mistyped twice and then got it right does not carry a count toward a
  lockout they would never understand.
- **The map is bounded** (10,000 entries, evicting oldest first). The key
  comes from a request body, so an unbounded map would turn a brute-force
  defence into a memory-exhaustion vector.

State is in-memory and per-process, which suits one container running one
process (docs/specs/deployment.md). A restart clears it: an attacker cannot
force one, and a locked-out legitimate user benefits.

### Why a cap and not a delay

Slowing failed logins is the reflex, and here it would be **actively
harmful**. Measured against Radicale with bcrypt hashing:

```
wrong password: min 1925ms, median 2148ms, max 2313ms
right password: min  118ms, median  146ms, max  153ms
```

The ranges do not overlap, so response time already classifies a guess on
its own — a timing oracle, caused upstream by bcrypt running only when the
password is wrong. Adding latency to failures would *widen* the gap an
attacker reads.

Delay also bounds nothing: 20 guesses fired in parallel complete in the
time of one. A cap bounds the total however the attempts are issued, and
costs a legitimate user nothing.

The timing oracle itself is left open. Closing it means padding every
sign-in to a fixed floor above the slow path — roughly 2s on every correct
login — and it only reveals whether a guess was right, which the status
code reveals anyway. The cap is what bounds the guessing.

## What these headers do not address

They are defence in depth, not the fix for a specific known hole. The audit
in issue #43 found no XSS sink in the client — no `dangerouslySetInnerHTML`,
no `innerHTML`, no `eval` — so the CSP currently guards against a class of
bug rather than an existing one. That is the point of adding it before the
repository goes public rather than after.

The one finding it does **not** address is SSRF via a user-supplied
`serverUrl`: that is a server-side request, made by the BFF, and no
browser-facing header touches it. See the allowlist below.

## Which CalDAV hosts sign-in may reach

`CALDAV_ALLOWED_HOSTS` restricts the addresses `POST /api/session` will
send credentials to. A `serverUrl` that does not match is refused with
`403 server_not_allowed` **before any request leaves the process**.

```
CALDAV_ALLOWED_HOSTS=dav.example.com, *.example.org, 192.168.1.10:5232
```

Comma-separated. Each entry is a hostname, optionally with a port, and
optionally with a leading `*.` wildcard:

| Entry | Matches | Does not match |
|---|---|---|
| `dav.example.com` | that host, any port | `evil.com`, `notdav.example.com` |
| `dav.example.com:5232` | that host on 5232 only | the same host on 8080 |
| `*.example.com` | `dav.example.com`, `a.b.example.com` | `example.com`, `evil-example.com` |

The wildcard deliberately does **not** match its own parent domain, the
same way a TLS wildcard behaves — and, more importantly, a naive
suffix match would have accepted `evil-example.com`, which anyone can
register.

### Off by default, and why

**An empty value means no restriction**, and that is the shipped default.
This is the one place in the codebase that deliberately fails *open*.

Pointing Fold at a private address is the **normal** self-hosting case:
`http://192.168.1.10:5232/`, a `.local` name, a Tailscale address. A
blanket private-IP block — the obvious fix — would break the product for
exactly the people it is for. Making the restriction opt-in means
upgrading Fold never silently breaks an existing deployment's sign-in.

Set it when the login page is reachable by people other than the operator.
A single-user deployment behind Tailscale or on a home LAN does not need
it.

### What it prevents

`serverUrl` arrives from an **unauthenticated** caller, and the server then
makes requests to it. Without a restriction, anyone who can reach the login
page can make Fold issue requests to whatever its container can reach —
loopback services, other hosts on the LAN, cloud metadata endpoints — with
the attacker's chosen credentials attached and Fold's address on the
packets rather than theirs (issue #43).

Verified end-to-end rather than in unit tests alone. With a listener
standing in for an internal service:

- **no allowlist** — the BFF touched it 3 times, as before
- **allowlist not naming it** — touched **0 times**, every attempt `403`

including the bypasses worth checking: `http://dav.example.com@127.0.0.1/`
(userinfo is not the host), `http://evil-dav.example.com/`, `file:///`,
`http://[::1]:5232/` and `169.254.169.254`. A legitimate allowlisted LAN
Radicale still signs in normally, and the same box on a different port is
still refused.

### Ordering, and why it matters

The host check runs **before** the attempt cap reserves a slot. A refused
host never reaches the network, so it is not a failed sign-in and must not
consume one of the five — otherwise a misconfigured client hammering a
disallowed URL would lock out the legitimate one.

The refusal does not name the allowed hosts. Telling an attacker which
hosts *are* reachable would give back some of what refusing them earns.

### What it does not fix

The relay is narrowed, not removed. An operator who allowlists nothing is
in exactly the position the audit described, and one who allowlists their
own CalDAV server can still have guesses relayed at *that* server — which
is what the attempt cap above bounds. The two work together: the allowlist
limits *where*, the cap limits *how many*.

*(added 2026-08-11, closing the SSRF finding in issue #43.)*
