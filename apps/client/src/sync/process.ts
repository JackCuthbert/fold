import { FatalError, RetryableError } from '@fold/outbox'
import { conflictResponseSchema, type Mutation, type Todo } from '@fold/schemas'
import type { Api } from '../api/client'
import { ApiError, NetworkError } from '../api/errors'

const freshEtag = (error: ApiError): string | null => {
  const parsed = conflictResponseSchema.safeParse(error.body)
  return parsed.success ? parsed.data.todo.etag : null
}

export type BlockReason = 'offline' | 'server' | 'auth'

// Shared with the query layer (docs/specs/sync-and-offline.md — "Status
// must reflect reality"): ordinary reads (getSession/getTodos/getLists)
// never go through the outbox, so they need the same offline/server
// classification the mutation path uses in order to report a blocked
// reason from a failed read too, not just a failed queued mutation.
export const classifyBlockReason = (error: unknown): BlockReason | null => {
  if (error instanceof NetworkError) return 'offline'
  if (error instanceof ApiError && error.status >= 500) return 'server'
  return null
}

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
      // docs/specs/todos.md — moving a todo between lists: copy to the
      // target first, then delete the original. Copy-first is deliberate —
      // if the copy fails nothing is lost and the todo stays put, whereas
      // deleting first would risk destroying the only copy.
      case 'moveTodo': {
        let created: Todo
        try {
          created = await api.createTodo(mutation.targetListId, mutation.todo)
        } catch (error) {
          // A retry whose earlier attempt copied successfully but died
          // before deleting: the target already holds the todo, so the
          // server reports 412 with it attached. That IS this step's
          // result, not a failure — swallow it and go on to the delete, or
          // the move would strand a duplicate forever. Handled here rather
          // than in the outer catch, which can only abort the whole
          // dispatch and so would never reach the delete.
          if (!(error instanceof ApiError) || error.status !== 412) throw error
          const conflict = conflictResponseSchema.safeParse(error.body)
          if (!conflict.success) throw error
          created = conflict.data.todo
        }
        try {
          await api.deleteTodo(
            mutation.listId,
            mutation.uid,
            etagOverride ?? mutation.etag,
          )
        } catch (error) {
          // Already gone (an earlier attempt's delete landed, or another
          // client removed it) — the move is complete either way.
          if (!(error instanceof ApiError) || error.status !== 404) throw error
        }
        return created
      }
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
        // Keep the mutation queued so it replays after re-login
        // (docs/specs/authentication.md), but say so plainly — "Syncing"
        // would imply progress that cannot happen while signed out.
        onUnauthorized()
        throw new TaggedRetryableError('auth', 'unauthorized', {
          cause: error,
        })
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
        (mutation.kind === 'updateTodo' ||
          mutation.kind === 'deleteTodo' ||
          // A move's *delete* step 412s whenever the source's etag moved on
          // since the mutation was queued — which an edit saved alongside
          // the move does, every time. Without the rebase the delete is
          // dropped as fatal and the todo is left in both lists.
          mutation.kind === 'moveTodo')
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
