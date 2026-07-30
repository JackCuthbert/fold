import { FatalError, RetryableError } from '@caldav-todo/outbox'
import { conflictResponseSchema, type Mutation } from '@caldav-todo/schemas'
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

// Drain-side mutation processing with LWW conflict rebase —
// docs/specs/sync-and-offline.md (conflict handling).
export function makeProcessMutation(
  api: Api,
  onUnauthorized: () => void,
): (mutation: Mutation) => Promise<void> {
  const dispatch = async (
    mutation: Mutation,
    etagOverride?: string,
  ): Promise<void> => {
    switch (mutation.kind) {
      case 'createTodo':
        await api.createTodo(mutation.listId, mutation.todo)
        return
      case 'updateTodo':
        await api.updateTodo(
          mutation.listId,
          mutation.uid,
          etagOverride ?? mutation.etag,
          mutation.changes,
        )
        return
      case 'deleteTodo':
        await api.deleteTodo(
          mutation.listId,
          mutation.uid,
          etagOverride ?? mutation.etag,
        )
        return
      case 'createList':
        await api.createList(mutation.listId, mutation.displayName)
        return
      case 'renameList':
        await api.renameList(mutation.listId, mutation.displayName)
        return
      case 'deleteList':
        await api.deleteList(mutation.listId)
        return
    }
  }

  return async (mutation) => {
    try {
      await dispatch(mutation)
    } catch (error) {
      if (error instanceof NetworkError) {
        throw new TaggedRetryableError('offline', 'offline', { cause: error })
      }
      if (!(error instanceof ApiError)) throw error
      if (error.status === 502) {
        throw new TaggedRetryableError('server', 'caldav unreachable', {
          cause: error,
        })
      }
      if (error.status === 401) {
        onUnauthorized()
        throw new RetryableError('unauthorized', { cause: error })
      }
      if (
        error.status === 412 &&
        (mutation.kind === 'updateTodo' || mutation.kind === 'deleteTodo')
      ) {
        const etag = freshEtag(error)
        if (etag) {
          try {
            await dispatch(mutation, etag)
            return
          } catch (retryError) {
            throw new FatalError('conflict after rebase', {
              cause: retryError,
            })
          }
        }
      }
      throw new FatalError(`unrecoverable API error ${error.status}`, {
        cause: error,
      })
    }
  }
}
