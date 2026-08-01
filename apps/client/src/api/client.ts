import {
  listsResponseSchema,
  sessionSchema,
  todoListSchema,
  todoSchema,
  todosResponseSchema,
  type Credentials,
  type NewTodo,
  type Session,
  type Todo,
  type TodoChanges,
  type TodoList,
  type TodosResponse,
} from '@fold/schemas'
import { ApiError, NetworkError } from './errors'

async function call(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
  headers?: Record<string, string>,
): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: {
        ...headers,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
  } catch (cause) {
    throw new NetworkError('network request failed', { cause })
  }
  const parsed =
    response.status === 204
      ? undefined
      : await response.json().catch(() => undefined)
  if (!response.ok) throw new ApiError(response.status, parsed)
  return parsed
}

const enc = encodeURIComponent

export function createApi() {
  return {
    login: async (credentials: Credentials): Promise<Session> =>
      sessionSchema.parse(await call('/api/session', 'POST', credentials)),
    logout: async (): Promise<void> => {
      await call('/api/session', 'DELETE')
    },
    getSession: async (): Promise<Session | null> => {
      try {
        return sessionSchema.parse(await call('/api/session', 'GET'))
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null
        throw error
      }
    },
    getLists: async (): Promise<TodoList[]> =>
      listsResponseSchema.parse(await call('/api/lists', 'GET')),
    createList: async (id: string, displayName: string): Promise<TodoList> =>
      todoListSchema.parse(
        await call('/api/lists', 'POST', { id, displayName }),
      ),
    renameList: async (id: string, displayName: string): Promise<void> => {
      await call(`/api/lists/${enc(id)}`, 'PATCH', { displayName })
    },
    deleteList: async (id: string): Promise<void> => {
      await call(`/api/lists/${enc(id)}`, 'DELETE')
    },
    /** `null` = 304, the caller's cached copy is still current. */
    getTodos: async (
      listId: string,
      knownCtag?: string,
    ): Promise<TodosResponse | null> => {
      try {
        return todosResponseSchema.parse(
          await call(
            `/api/lists/${enc(listId)}/todos`,
            'GET',
            undefined,
            knownCtag ? { 'if-none-match': knownCtag } : undefined,
          ),
        )
      } catch (error) {
        if (error instanceof ApiError && error.status === 304) return null
        throw error
      }
    },
    createTodo: async (listId: string, todo: NewTodo): Promise<Todo> =>
      todoSchema.parse(
        await call(`/api/lists/${enc(listId)}/todos`, 'POST', todo),
      ),
    updateTodo: async (
      listId: string,
      uid: string,
      etag: string,
      changes: TodoChanges,
    ): Promise<Todo> =>
      todoSchema.parse(
        await call(`/api/lists/${enc(listId)}/todos/${enc(uid)}`, 'PUT', {
          etag,
          changes,
        }),
      ),
    deleteTodo: async (
      listId: string,
      uid: string,
      etag: string,
    ): Promise<void> => {
      await call(`/api/lists/${enc(listId)}/todos/${enc(uid)}`, 'DELETE', {
        etag,
      })
    },
  }
}

export type Api = ReturnType<typeof createApi>
