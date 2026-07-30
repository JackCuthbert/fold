export class ApiError extends Error {
  override name = 'ApiError'
  status: number
  body: unknown
  constructor(status: number, body: unknown) {
    super(`API responded ${status}`)
    this.status = status
    this.body = body
  }
}

/** fetch itself failed — we are offline or the BFF is down. */
export class NetworkError extends Error {
  override name = 'NetworkError'
}
