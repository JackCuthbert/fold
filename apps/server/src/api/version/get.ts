import { versionSchema } from '@fold/schemas'
import pkg from '../../../../../package.json' with { type: 'json' }
import { json, parseResponse, type Route } from '../route'

/**
 * GET /api/version — docs/specs/releases.md.
 *
 * **Unauthenticated**, unlike every other route here. The running version
 * is not a secret — it is printed in the image tag and in the release
 * notes — and the Help modal that shows it is reachable from the login
 * screen, so requiring a session would make it unavailable exactly where
 * someone diagnosing a fresh install would look.
 *
 * The version comes from the root `package.json`, which the runtime image
 * already ships (Dockerfile — runtime stage), so there is no build
 * argument to forget and no way for what is displayed to disagree with
 * what is running.
 */
export const getVersion: Route = {
  method: 'GET',
  path: '/api/version',
  handle: async (ctx) => {
    const current = pkg.version
    // Resolves null when the check is off (the default) or when anything
    // at all went wrong — a failed check is not the user's problem.
    const latest = await ctx.app.checkForUpdate(current)
    return json(
      parseResponse(versionSchema, {
        current,
        latest,
        updateAvailable: latest !== null,
      }),
    )
  },
}
