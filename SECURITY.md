# Security

Fold handles your CalDAV credentials, so security reports are welcome and
taken seriously.

## Reporting a vulnerability

**Please report privately, not as a public issue.** Use GitHub's
[private vulnerability reporting](https://github.com/JackCuthbert/fold/security/advisories/new)
— it opens a channel visible only to the maintainer.

Useful things to include: what an attacker can do, the steps to reproduce
it, and the version or commit you tested. A proof of concept helps but is
not required.

This is a personal project maintained by one person, so there is no formal
response-time guarantee. Expect an acknowledgement within a week or so. If
a report is confirmed, the fix and an advisory go out together.

## What is in scope

The app and the published image:

- The BFF (`apps/server`) — the JSON API, the CalDAV gateway, the session
  cookie.
- The client (`apps/client`) — anything that could expose credentials or
  another user's data to page scripts.
- The container image and its build.

Fold's own security notes are written up in
[`docs/specs/security.md`](docs/specs/security.md) and
[`docs/architecture/sealed-cookie-sessions.md`](docs/architecture/sealed-cookie-sessions.md),
including several things that are **deliberate** rather than oversights —
the absent HSTS header, the CSP's boundaries, and which CalDAV hosts
sign-in will reach. Worth a read before reporting; if you disagree with one
of those calls, that is still worth raising.

## What is out of scope

- **Your CalDAV server.** Fold talks to it, but its security is its own.
- **Running Fold over plain HTTP.** The session cookie is `Secure` by
  default for this reason. `ALLOW_INSECURE_COOKIE=true` deliberately
  disables that for trusted LANs, and the README says what it costs.
- **Anything requiring `SESSION_SECRET`.** That value is the key to every
  session; whoever holds it can forge one, by design.
- Missing headers with no demonstrated impact, and automated scanner output
  without a working exploit.

## Where your credentials go

Worth stating plainly, since it shapes what a vulnerability would mean:
**Fold never stores your CalDAV password.** There is no user table and no
session store. Credentials are encrypted (AES-256-GCM) into an `HttpOnly`,
`SameSite=Strict` cookie that only Fold can open, unsealed in memory per
request, and discarded. A compromised Fold instance exposes whatever
sessions are in flight — not a database of everyone's passwords, because
there isn't one.
