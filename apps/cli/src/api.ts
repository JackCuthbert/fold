import {
  conflictResponseSchema,
  listsResponseSchema,
  sessionSchema,
  todoSchema,
  todosResponseSchema,
  type Credentials,
  type NewTodo,
  type Session,
  type Todo,
  type TodoChanges,
  type TodoList,
} from '@fold/schemas'
import { ApiError, CliError } from './errors'
import type { SessionStore, StoredSession } from './session-store'

const enc = encodeURIComponent

export class FoldApi {
  private constructor(
    private session: StoredSession,
    private readonly store: SessionStore,
    private readonly fetcher: typeof fetch,
  ) {}

  static async authenticated(
    store: SessionStore,
    fetcher: typeof fetch = fetch,
  ): Promise<FoldApi> {
    const session = await store.load()
    if (!session) {
      throw new CliError('Not signed in; run fold auth login', 3)
    }
    return new FoldApi(session, store, fetcher)
  }

  static async login(
    foldUrl: string,
    credentials: Credentials,
    store: SessionStore,
    fetcher: typeof fetch = fetch,
  ): Promise<Session> {
    const response = await request(fetcher, `${foldUrl}/api/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(credentials),
    })
    const cookie = sessionCookie(response)
    if (!cookie) {
      throw new CliError('Fold did not return a valid session cookie')
    }
    const body = sessionSchema.parse(await responseBody(response))
    await store.save({ foldUrl, ...cookie })
    return body
  }

  async status(): Promise<Session> {
    return sessionSchema.parse(await this.call('/api/session'))
  }

  async logout(): Promise<void> {
    try {
      await this.call('/api/session', { method: 'DELETE' })
    } finally {
      await this.store.clear()
    }
  }

  async lists(): Promise<TodoList[]> {
    return listsResponseSchema.parse(await this.call('/api/lists'))
  }

  async todos(listId: string): Promise<Todo[]> {
    const response = todosResponseSchema.parse(
      await this.call(`/api/lists/${enc(listId)}/todos`),
    )
    return response.todos
  }

  async createTodo(listId: string, todo: NewTodo): Promise<Todo> {
    return todoSchema.parse(
      await this.call(`/api/lists/${enc(listId)}/todos`, {
        method: 'POST',
        body: todo,
      }),
    )
  }

  async updateTodo(
    listId: string,
    uid: string,
    etag: string,
    changes: TodoChanges,
  ): Promise<Todo> {
    return todoSchema.parse(
      await this.call(`/api/lists/${enc(listId)}/todos/${enc(uid)}`, {
        method: 'PUT',
        body: { etag, changes },
      }),
    )
  }

  async deleteTodo(listId: string, uid: string, etag: string): Promise<void> {
    await this.call(`/api/lists/${enc(listId)}/todos/${enc(uid)}`, {
      method: 'DELETE',
      body: { etag },
    })
  }

  conflict(error: unknown): Todo | null {
    if (!(error instanceof ApiError) || error.status !== 412) return null
    const parsed = conflictResponseSchema.safeParse(error.body)
    return parsed.success ? parsed.data.todo : null
  }

  private async call(
    path: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<unknown> {
    let response: Response
    try {
      response = await request(this.fetcher, `${this.session.foldUrl}${path}`, {
        method: init.method ?? 'GET',
        headers: {
          cookie: this.session.cookie,
          ...(init.body === undefined
            ? {}
            : { 'content-type': 'application/json' }),
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await this.store.clear()
        throw new CliError('Session expired; run fold auth login', 3, {
          cause: error,
        })
      }
      throw error
    }

    const renewed = sessionCookie(response)
    if (renewed) {
      this.session = { ...this.session, ...renewed }
      await this.store.save(this.session)
    }
    return responseBody(response)
  }
}

const request = async (
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<Response> => {
  let response: Response
  try {
    response = await fetcher(url, init)
  } catch (cause) {
    throw new CliError('Could not reach Fold', 1, { cause })
  }
  if (!response.ok)
    throw new ApiError(response.status, await responseBody(response))
  return response
}

const responseBody = async (response: Response): Promise<unknown> => {
  if (response.status === 204) return undefined
  const text = await response.text()
  if (text === '') return undefined
  try {
    return JSON.parse(text)
  } catch {
    throw new CliError('Fold returned an invalid JSON response')
  }
}

const sessionCookie = (
  response: Response,
  now: number = Date.now(),
): Pick<StoredSession, 'cookie' | 'expiresAt'> | null => {
  const header = response.headers.get('set-cookie')
  if (!header) return null
  const value = /(?:^|,\s*)session=([^;]*)/.exec(header)?.[1]
  const maxAge = /(?:^|;)\s*Max-Age=(\d+)(?:;|$)/i.exec(header)?.[1]
  if (!value || !maxAge) return null
  return {
    cookie: 'session=' + value,
    expiresAt: now + Number(maxAge) * 1000,
  }
}
