export class HttpError extends Error {
  override name = 'HttpError'
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}
