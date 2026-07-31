import { FatalError, RetryableError } from '@caldav-todo/outbox'
import {
  conflictResponseSchema,
  type Mutation,
  type Todo,
} from '@caldav-todo/schemas'
import type { Api } from '../api/client'
import { ApiError, NetworkError } from '../api/errors'

const freshEtag = (error: ApiError): string | null => {
  const parsed = conflictResponseSchema.safeParse(error.body)
  return parsed.success ? parsed.data.todo.etag : null
}

export type BlockReason = 'offline' | 'server'

export class TaggedRetryableError extends RetryableError {
  reason: BlockReason
  constructor(reason: BlockReason, message: string, options?: ErrorOptions) {
    super(message, options)
    this.reason = reason
  }
}

// Distinguishes *why* a mutation was dropped so the UI can say something
// true: a real 412-after-rebase is a conflict; anything else (a 4xx client
// bug we don't otherwise handle) isn't — docs/specs/sync-and-offline.md.
export type DropReason = 'conflict' | 'other'

export class TaggedFatalError extends FatalError {
  reason: DropReason
  constructor(reason: DropReason, message: string, options?: ErrorOptions) {
    super(message, options)
    this.reason = reason
  }
}

// Drain-side mutation processing with LWW conflict rebase —
// docs/specs/sync-and-offline.md (conflict handling).
//
// createTodo/updateTodo return the server's authoritative Todo (real href
// and etag) so the caller can patch the cache immediately — without this,
// the optimistic placeholder keeps an empty etag until the next refetch,
// and a mutation the user queues against it in that window (e.g.
// completing a todo the instant after creating it) is sent with an
// invalid etag and gets dropped as a fatal 400/412.
export function makeProcessMutation(
  api: Api,
  onUnauthorized: () => void,
): (mutation: Mutation) => Promise<Todo | undefined> {
  const dispatch = async (
    mutation: Mutation,
    etagOverride?: string,
  ): Promise<Todo | undefined> => {
    switch (mutation.kind) {
      case 'createTodo':
        return api.createTodo(mutation.listId, mutation.todo)
      case 'updateTodo':
        return api.updateTodo(
          mutation.listId,
          mutation.uid,
          etagOverride ?? mutation.etag,
          mutation.changes,
        )
      case 'deleteTodo':
        await api.deleteTodo(
          mutation.listId,
          mutation.uid,
          etagOverride ?? mutation.etag,
        )
        return undefined
      case 'createList':
        await api.createList(mutation.listId, mutation.displayName)
        return undefined
      case 'renameList':
        await api.renameList(mutation.listId, mutation.displayName)
        return undefined
      case 'deleteList':
        await api.deleteList(mutation.listId)
        return undefined
      default:
        return mutation satisfies never
    }
  }

  return async (mutation) => {
    try {
      return await dispatch(mutation)
    } catch (error) {
      if (error instanceof NetworkError) {
        throw new TaggedRetryableError('offline', 'offline', { cause: error })
      }
      if (!(error instanceof ApiError)) throw error
      if (error.status >= 500) {
        // Any 5xx — not just the documented 502 (CalDAV unreachable) — is
        // the server (or an intermediary: reverse proxy, load balancer,
        // CDN) reporting its own problem. That's inherently transient,
        // never the client's fault, so it must retry rather than drop the
        // user's work (docs/specs/api.md — error mapping).
        throw new TaggedRetryableError('server', 'server error', {
          cause: error,
        })
      }
      if (error.status === 401) {
        onUnauthorized()
        throw new RetryableError('unauthorized', { cause: error })
      }
      if (error.status === 412 && mutation.kind === 'createTodo') {
        // The outbox retried an unacked create whose first attempt had
        // actually already landed (e.g. the ack was lost when the
        // connection dropped mid-request). The server reports this as a
        // conflict with the now-existing todo attached — since there's
        // nothing left to change, that response IS the create's result,
        // not a failure (docs/specs/sync-and-offline.md — outbox retries).
        const conflict = conflictResponseSchema.safeParse(error.body)
        if (conflict.success) return conflict.data.todo
      }
      if (
        error.status === 412 &&
        (mutation.kind === 'updateTodo' || mutation.kind === 'deleteTodo')
      ) {
        const etag = freshEtag(error)
        if (etag) {
          try {
            return await dispatch(mutation, etag)
          } catch (retryError) {
            throw new TaggedFatalError('conflict', 'conflict after rebase', {
              cause: retryError,
            })
          }
        }
      }
      throw new TaggedFatalError(
        'other',
        `unrecoverable API error ${error.status}`,
        { cause: error },
      )
    }
  }
}
