/**
 * Security headers — docs/specs/security.md.
 *
 * Fold is a single-origin app: the BFF serves the client bundle *and* the
 * JSON API, the browser never talks to the CalDAV server directly, and
 * every asset — fonts included — is self-hosted. That combination is what
 * makes a genuinely strict policy affordable here, where in most apps it
 * would mean allowlisting a CDN, an analytics host and a font provider.
 *
 * Applied to every response, static and API alike. A header that only
 * covers *some* responses is the kind of gap that survives a review: the
 * one path that skipped it is invisible until someone finds it.
 *
 * *(added 2026-08-11, from the pre-public security audit — issue #43.)*
 */

/**
 * The Content-Security-Policy.
 *
 * `default-src 'none'` first, so anything not named below is denied rather
 * than inherited — a directive nobody thought to add fails closed.
 *
 * - **`script-src 'self'`** — no `'unsafe-inline'` and no `'unsafe-eval'`.
 *   Vite emits the bundle as an external module (`<script type="module"
 *   src="/assets/…">`), so there is no inline script to allow, and none of
 *   the runtime evaluates strings. This is the directive doing the real
 *   work: it is what turns an injected `<script>` into a no-op.
 * - **`style-src 'self' 'unsafe-inline'`** — styling is CSS Modules, which
 *   compile to real stylesheets, but three components set a `style`
 *   attribute for a value only known at runtime: a list's colour
 *   (color-picker, view-header) and a typeface preview's font stack
 *   (typeface-choice). React renders those as inline styles, which CSP
 *   counts under `style-src`. `'unsafe-inline'` is a genuine weakening,
 *   but a much smaller one than for scripts — it permits restyling, not
 *   execution — and removing it means a nonce threaded through render, or
 *   dropping per-list colours. Revisit if those three ever go.
 * - **`img-src 'self' data:`** — `data:` because the favicon and inlined
 *   SVGs travel that way through the bundler.
 * - **`font-src 'self'`** — the fonts are self-hosted deliberately, so
 *   nothing is fetched from a CDN (docs/specs/themes.md). This makes that
 *   a rule rather than a habit.
 * - **`connect-src 'self'`** — the browser only ever calls this origin.
 *   The CalDAV server is reached by the BFF, never by the page, which is
 *   the whole point of the BFF (docs/specs/overview.md). If the client is
 *   ever split onto a separate origin this has to change, and so does the
 *   `SameSite=Strict` cookie.
 * - **`manifest-src 'self'`** — the PWA manifest (docs/architecture/pwa.md).
 * - **`base-uri 'none'`** — an injected `<base>` can re-point every
 *   relative URL on the page, including the script src.
 * - **`form-action 'none'`** — nothing here submits a native form; every
 *   form is handled in JS. This stops an injected form exfiltrating to an
 *   attacker's host.
 * - **`frame-ancestors 'none'`** — clickjacking. Supersedes
 *   `X-Frame-Options` in modern browsers; that header is sent too, for old
 *   ones that don't read this.
 */
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ')

/**
 * Headers added to every response.
 *
 * Deliberately absent: **HSTS**. It would be actively harmful here —
 * `ALLOW_INSECURE_COOKIE` exists because a LAN-only or `.local`
 * deployment may have no certificate (config.ts), and an HSTS header
 * pins that browser to HTTPS for the max-age, locking the user out of
 * their own install with no way to undo it from the app. HTTPS belongs to
 * whatever terminates TLS in front of Fold, and so does HSTS.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'content-security-policy': CSP,
  // Stops a browser second-guessing a declared Content-Type — the trick
  // that turns an uploaded or user-controlled file into an executable
  // script by sniffing it.
  'x-content-type-options': 'nosniff',
  // A self-hosted CalDAV deployment's hostname is itself identifying:
  // `todos.my-surname.example` in a Referer tells any third party the user
  // reaches who they are. Nothing here needs a referrer at all.
  'referrer-policy': 'no-referrer',
  // For browsers predating `frame-ancestors`.
  'x-frame-options': 'DENY',
}

/**
 * Return `response` with the security headers applied.
 *
 * Copies rather than mutating: a `Response` built by `Bun.file()` or
 * `Response.json()` has mutable headers, but a redirect or a proxied
 * response may not, and discovering that in production is not the place.
 * Existing headers win — nothing here should silently overwrite a header
 * a handler set on purpose.
 */
export function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
