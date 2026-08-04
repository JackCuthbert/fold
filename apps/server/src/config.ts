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
})

export type Config = z.infer<typeof configSchema>

export function loadConfig(env: Record<string, string | undefined>): Config {
  return configSchema.parse(env)
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
