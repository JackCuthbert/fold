/** Transient failure (network down, 5xx): keep the mutation, retry later. */
export class RetryableError extends Error {
  override name = 'RetryableError'
}

/** Permanent failure (unresolvable conflict): drop the mutation. */
export class FatalError extends Error {
  override name = 'FatalError'
}
