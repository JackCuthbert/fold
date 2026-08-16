import { z } from 'zod'

/**
 * What `GET /api/version` returns (docs/specs/releases.md).
 *
 * `latest` is `null` whenever there is nothing to say — the update check
 * is off (the default), the request failed, or GitHub answered with
 * something unexpected. A failed check is *not* an error the user should
 * see: the app works exactly as well either way, so it degrades to
 * "current version only" rather than surfacing a problem nobody asked to
 * hear about.
 */
export const versionSchema = z.object({
  /** The running version, from the root package.json. */
  current: z.string(),
  /** The newest published release, or null — see above. */
  latest: z.string().nullable(),
  /**
   * Whether `latest` is actually newer than `current`, decided on the
   * server so the client never has to compare version strings — a
   * comparison that looks trivial and is not (`0.10.0` vs `0.9.0`).
   */
  updateAvailable: z.boolean(),
})
export type VersionInfo = z.infer<typeof versionSchema>
