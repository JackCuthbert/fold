export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode = 1,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'CliError'
  }
}

export class ApiError extends CliError {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(
      messageFromBody(body, `Fold returned HTTP ${status}`),
      exitFor(status),
    )
    this.name = 'ApiError'
  }
}

const exitFor = (status: number): number => {
  if (status === 401) return 3
  if (status === 412) return 4
  return 1
}

const messageFromBody = (body: unknown, fallback: string): string => {
  if (
    typeof body === 'object' &&
    body !== null &&
    'message' in body &&
    typeof body.message === 'string'
  ) {
    return body.message
  }
  return fallback
}
