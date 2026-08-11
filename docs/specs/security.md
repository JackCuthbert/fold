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

## What these headers do not address

They are defence in depth, not the fix for a specific known hole. The audit
in issue #43 found no XSS sink in the client — no `dangerouslySetInnerHTML`,
no `innerHTML`, no `eval` — so the CSP currently guards against a class of
bug rather than an existing one. That is the point of adding it before the
repository goes public rather than after.

The one finding it does **not** address is SSRF via a user-supplied
`serverUrl`: that is a server-side request, made by the BFF, and no
browser-facing header touches it.
