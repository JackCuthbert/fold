import { z } from 'zod'

const configSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  SESSION_SECRET: z.string().min(16),
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  /**
   * Serve over plain HTTP, dropping `Secure` from the session cookie.
   *
   * Fold is self-hosted, and not every deployment can get a certificate: a
   * LAN-only box, a `.local` hostname, a private VLAN behind someone
   * else's TLS. Without an escape hatch those deployments hit the worst
   * failure we have — sign-in returns 200, the browser silently discards
   * the `Secure` cookie, and the login screen reappears with nothing to
   * explain why (docs/specs/deployment.md — HTTPS).
   *
   * Named for the situation rather than reusing `NODE_ENV=development`,
   * which would also turn off production behaviour that has nothing to do
   * with TLS and reads as a mistake in a deployment.
   *
   * It is a real downgrade: the cookie seals the user's CalDAV
   * credentials, and over plain HTTP anyone on the path can copy it. Opt
   * in deliberately, on a network you trust.
   *
   * *(added 2026-08-04.)*
   */
  // `.catch(false)` rather than a bare `.stringbool()`: anything that
  // isn't an affirmative opt-in — absent, empty (`FOO=` in a compose file
  // or an unset `${FOO}` both arrive as ''), or unparseable — must leave
  // the cookie secure. Failing *closed* matters more here than telling
  // the operator they typo'd, and refusing to boot over a stray empty
  // value would turn a shrug into an outage.
  ALLOW_INSECURE_COOKIE: z.stringbool().catch(false),
  /**
   * Check GitHub for a newer release (docs/specs/releases.md).
   *
   * **Off by default, deliberately.** Fold otherwise talks to exactly one
   * host — the user's own CalDAV server — and a self-hosted app should not
   * quietly acquire a second one. A deployment that wants to be told about
   * upgrades opts in; one that does not makes no outbound call.
   *
   * `.catch(false)` for the same reason as `ALLOW_INSECURE_COOKIE`: an
   * absent, empty or unparseable value means "not asked for", and refusing
   * to boot over a stray value would turn a shrug into an outage.
   *
   * *(added 2026-08-10.)*
   */
  CHECK_FOR_UPDATES: z.stringbool().catch(false),
  /**
   * Which CalDAV hosts sign-in may be pointed at (docs/specs/security.md).
   *
   * Comma-separated, each optionally with a port and optionally with a
   * `*.` wildcard: `dav.example.com, *.example.org, 192.168.1.10:5232`.
   *
   * **Empty by default, meaning no restriction.** `serverUrl` comes from
   * an unauthenticated caller and the server then fetches it, so an open
   * Fold can be used to reach whatever its container can reach (issue
   * #43). The obvious fix — block private addresses — would break the
   * product for its own audience, since pointing Fold at a LAN address is
   * the normal self-hosting case. So this is opt-in, and the default
   * preserves existing behaviour rather than breaking every deployment on
   * upgrade.
   *
   * Unlike the two flags above there is no `.catch()`: this one is a
   * *string*, so there is no parse to fail. An unset or empty value is
   * simply "no restriction", which `parseAllowedHosts` handles.
   *
   * *(added 2026-08-11.)*
   */
  CALDAV_ALLOWED_HOSTS: z.string().default(''),
  /**
   * Replace the CalDAV gateway with an in-memory fake, and expose the
   * test-only admin route that seeds it (docs/specs/testing.md — the two
   * e2e modes).
   *
   * **For the e2e suite only.** It removes the CalDAV server entirely:
   * every list and todo lives in process memory, dies with the process,
   * and the admin route lets any caller rewrite it without signing in.
   * A deployment that switched this on would be serving a todo app that
   * silently forgets everything and lets strangers seed it.
   *
   * So unlike `ALLOW_INSECURE_COOKIE` and `CHECK_FOR_UPDATES` — which
   * `.catch(false)` deliberately, because a stray value should shrug
   * rather than cause an outage — this one is checked *and* cross-checked
   * against `NODE_ENV` below, and refusing to boot is the correct
   * outcome. The two flags above degrade a deployment; this one would
   * hollow it out, and failing loudly at startup is the only way an
   * operator finds out before their data does.
   *
   * *(added 2026-08-14, issue #54.)*
   */
  CALDAV_FAKE: z.stringbool().catch(false),
})

export type Config = z.infer<typeof configSchema>

/**
 * The second opt-in `CALDAV_FAKE` requires.
 *
 * Deliberately a sentence rather than a boolean: nobody sets this by
 * accident, and nobody carries it into a deployment without noticing what
 * they are typing.
 */
export const E2E_CONFIRMATION = 'i-am-running-the-e2e-suite'

export function loadConfig(env: Record<string, string | undefined>): Config {
  const config = configSchema.parse(env)
  // Checked at the one place every entry point passes through.
  //
  // Refused under `NODE_ENV=production` — which the published image sets
  // (Dockerfile) — *and* refused unless the caller also sets
  // `CALDAV_FAKE_CONFIRM=i-am-running-the-e2e-suite`.
  //
  // The second condition is the one that does the real work. `NODE_ENV`
  // defaults to `development`, and docs/specs/deployment.md actively
  // describes self-hosters running without it set, so a `NODE_ENV` check
  // alone would leave those deployments with no guard at all. Requiring a
  // second, deliberately unwieldy value means `CALDAV_FAKE=1` on its own
  // — the plausible typo, the copied-from-a-test compose line — fails
  // closed everywhere rather than only in production.
  //
  // *(added 2026-08-14, issue #54.)*
  if (config.CALDAV_FAKE) {
    if (config.NODE_ENV === 'production') {
      throw new Error(
        'CALDAV_FAKE is a test-only switch and cannot be used with ' +
          'NODE_ENV=production — it replaces the CalDAV server with an ' +
          'in-memory fake and exposes an unauthenticated seeding route ' +
          '(docs/specs/testing.md).',
      )
    }
    if (env['CALDAV_FAKE_CONFIRM'] !== E2E_CONFIRMATION) {
      throw new Error(
        'CALDAV_FAKE replaces the CalDAV server with an in-memory fake ' +
          'and exposes an unauthenticated seeding route. It is for the ' +
          'e2e suite only. If that is genuinely what you want, also set ' +
          `CALDAV_FAKE_CONFIRM=${E2E_CONFIRMATION} ` +
          '(docs/specs/testing.md).',
      )
    }
  }
  return config
}

/**
 * Whether the session cookie gets the `Secure` attribute.
 *
 * Production implies HTTPS unless the operator has explicitly said their
 * deployment has none — see `ALLOW_INSECURE_COOKIE`.
 */
export function useSecureCookie(config: Config): boolean {
  return config.NODE_ENV === 'production' && !config.ALLOW_INSECURE_COOKIE
}
