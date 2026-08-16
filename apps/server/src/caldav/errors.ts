/** Upstream CalDAV server answered with an error status. */
export class CaldavError extends Error {
  override name = 'CaldavError'
  constructor(
    readonly status: number,
    message?: string,
  ) {
    super(message ?? `CalDAV server responded ${status}`)
  }
}

/** Could not reach the CalDAV server at all. */
export class CaldavUnreachableError extends Error {
  override name = 'CaldavUnreachableError'
}
