import type {
  Credentials,
  NewTodo,
  Todo,
  TodoChanges,
  TodoList,
  TodosResponse,
} from '@fold/schemas'

/** docs/specs/lists.md — colours and ordering. */
export interface ListProps {
  /** `null` clears the property; `undefined` leaves it alone. */
  color?: string | null
  order?: number | null
}

// The seam between HTTP handlers and CalDAV. Handlers are unit-tested
// against a fake; the tsdav implementation is covered by the Radicale
// integration suite. See docs/specs/api.md.
export interface CaldavGateway {
  /** Principal discovery; throws CaldavError(401) on bad credentials. */
  login(): Promise<void>
  fetchLists(): Promise<TodoList[]>
  createList(
    id: string,
    displayName: string,
    props?: ListProps,
  ): Promise<TodoList>
  renameList(listId: string, displayName: string): Promise<void>
  /**
   * PROPPATCH colour and/or order. Optional properties from an Apple
   * extension: a server that ignores them must not fail the request
   * (docs/specs/caldav-compliance.md).
   */
  setListProps(listId: string, props: ListProps): Promise<void>
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
