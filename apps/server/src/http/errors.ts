export class HttpError extends Error {
  override name = 'HttpError'
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /**
     * Extra response headers this error requires — `Retry-After` on a 429,
     * for instance. Carried on the error rather than returned separately
     * because handlers signal failure by throwing, so there is nothing else
     * to hang them on (api/router.ts maps this to the response).
     */
    readonly headers?: Record<string, string>,
  ) {
    super(message)
  }
}
