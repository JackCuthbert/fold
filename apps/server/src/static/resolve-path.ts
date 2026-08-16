import { resolve, sep } from 'node:path'

/**
 * Map a request pathname to a file inside `root`, or `null` if it escapes.
 *
 * `new URL()` already collapses `..` segments, but this must not depend on
 * that: decode first (so `%2f`/`%2e` cannot smuggle separators past us),
 * then resolve and confirm the result is still inside `root`.
 */
export function resolveStaticPath(
  root: string,
  pathname: string,
): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    // Malformed percent-encoding.
    return null
  }
  if (decoded.includes('\0')) return null

  const candidate = resolve(root, `.${decoded}`)
  if (candidate !== root && !candidate.startsWith(root + sep)) return null
  return candidate
}
