/**
 * Which CalDAV hosts the BFF may be pointed at — docs/specs/security.md.
 *
 * `serverUrl` arrives from an **unauthenticated** caller and the server
 * then makes requests to it, so without a restriction Fold is a way to
 * reach whatever its container can reach: loopback services, other boxes
 * on the LAN, cloud metadata endpoints (issue #43, the pre-public audit).
 *
 * **Off by default, and that is deliberate.** Pointing Fold at a LAN
 * address is the *normal* self-hosting case — `http://192.168.1.10:5232/`
 * or a `.local` name is exactly what many deployments use. A blanket
 * private-IP block would break the product for its own audience, so the
 * restriction is opt-in and the default preserves today's behaviour. A
 * deployment reachable by people other than its operator sets this; one
 * behind Tailscale, on a home LAN, or single-user does not have to.
 *
 * *(added 2026-08-11.)*
 */

/**
 * Parse the `CALDAV_ALLOWED_HOSTS` value into matchers.
 *
 * Comma-separated hosts, each optionally with a port and optionally with a
 * leading `*.` wildcard:
 *
 *     dav.example.com
 *     dav.example.com:5232
 *     *.example.com
 *     192.168.1.10
 *
 * Empty or whitespace-only yields an empty list, which callers treat as
 * "no restriction" — see `isHostAllowed`.
 */
export function parseAllowedHosts(raw: string): string[] {
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== '')
}

/**
 * Does `url` point at a host the operator allowed?
 *
 * An **empty list means unrestricted**, matching the opt-in default. That
 * is a deliberate fail-open, and the one place in this codebase where
 * failing open is right: the alternative is that upgrading Fold silently
 * breaks every existing deployment's sign-in.
 *
 * Everything else fails closed. An unparseable URL, a non-HTTP scheme, or
 * a host that matches nothing is refused — zod already rejects a
 * non-URL before this runs, so a throw here would be a bug rather than
 * user error, but it is handled rather than assumed.
 */
export function isHostAllowed(url: string, allowed: string[]): boolean {
  if (allowed.length === 0) return true

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  // `file:`, `ftp:`, `gopher:` and friends are never a CalDAV server, and
  // some are reachable in ways HTTP is not. The gateway only ever speaks
  // HTTP, so anything else is refused before host matching even applies.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false
  }

  // `hostname` rather than `host`, so a port in the URL does not defeat a
  // bare-hostname rule — and `host` is compared separately below for rules
  // that do name a port. `URL` lowercases the hostname already; the
  // allowlist was lowercased at parse time.
  const hostname = parsed.hostname
  const hostWithPort = parsed.host

  return allowed.some((entry) => {
    if (entry.startsWith('*.')) {
      // `*.example.com` covers `dav.example.com` but NOT `example.com`
      // itself, matching how TLS wildcards behave — and, more importantly,
      // not matching `evil-example.com`, which a naive `endsWith` would.
      const suffix = entry.slice(1) // ".example.com"
      return hostname.endsWith(suffix) && hostname.length > suffix.length
    }
    // A rule naming a port must match the port; one that doesn't ignores it.
    return entry.includes(':') ? hostWithPort === entry : hostname === entry
  })
}
