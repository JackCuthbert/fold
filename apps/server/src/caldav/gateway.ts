import type {
  Credentials,
  NewTodo,
  Todo,
  TodoChanges,
  TodoList,
  TodosResponse,
} from '@fold/schemas'

// The seam between HTTP handlers and CalDAV. Handlers are unit-tested
// against a fake; the tsdav implementation is covered by the Radicale
// integration suite. See docs/specs/api.md.
export interface CaldavGateway {
  /** Principal discovery; throws CaldavError(401) on bad credentials. */
  login(): Promise<void>
  fetchLists(): Promise<TodoList[]>
  createList(id: string, displayName: string): Promise<TodoList>
  renameList(listId: string, displayName: string): Promise<void>
  deleteList(listId: string): Promise<void>
  /**
   * `null` when knownCtag matches the collection's current ctag —
   * the cheap-refetch short-circuit (docs/specs/caldav-compliance.md).
   */
  fetchTodos(listId: string, knownCtag?: string): Promise<TodosResponse | null>
  fetchTodo(listId: string, uid: string): Promise<Todo>
  createTodo(listId: string, todo: NewTodo): Promise<Todo>
  updateTodo(
    listId: string,
    uid: string,
    etag: string,
    changes: TodoChanges,
  ): Promise<Todo>
  deleteTodo(listId: string, uid: string, etag: string): Promise<void>
}

export type GatewayFactory = (credentials: Credentials) => CaldavGateway
