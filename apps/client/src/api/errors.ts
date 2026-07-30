export class ApiError extends Error {
  override name = 'ApiError'
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`API responded ${status}`)
  }
}

/** fetch itself failed — we are offline or the BFF is down. */
export class NetworkError extends Error {
  override name = 'NetworkError'
}
