import { randomUUID } from 'node:crypto'
import type { NewTodo, Todo, TodoChanges, TodoList } from '@fold/schemas'
import { FoldApi } from './api'
import { ApiError, CliError } from './errors'

export interface LocatedTodo {
  list: TodoList
  todo: Todo
}

export const listTodos = async (
  api: FoldApi,
  listName?: string,
): Promise<LocatedTodo[]> => {
  const lists = listName
    ? [await resolveList(api, listName)]
    : await api.lists()
  return (
    await Promise.all(
      lists.map(async (list) => ({ list, todos: await api.todos(list.id) })),
    )
  ).flatMap(({ list, todos }) => todos.map((todo) => ({ list, todo })))
}

export const createTodo = async (
  api: FoldApi,
  listName: string,
  summary: string,
  options: Pick<NewTodo, 'due' | 'description' | 'priority'> = {},
): Promise<Todo> => {
  const list = await resolveList(api, listName)
  return api.createTodo(list.id, {
    uid: randomUUID(),
    summary,
    ...options,
    created: new Date().toISOString(),
  })
}

export const editTodo = async (
  api: FoldApi,
  uid: string,
  changes: TodoChanges,
  listName?: string,
): Promise<Todo> => {
  const located = await resolveTodo(api, uid, listName)
  try {
    return await api.updateTodo(
      located.list.id,
      uid,
      located.todo.etag,
      changes,
    )
  } catch (error) {
    const fresh = api.conflict(error)
    if (
      !fresh ||
      (changes.summary !== undefined &&
        located.todo.summary !== fresh.summary) ||
      ('due' in changes && !sameDue(located.todo.due, fresh.due)) ||
      ('description' in changes &&
        located.todo.description !== fresh.description) ||
      ('priority' in changes && located.todo.priority !== fresh.priority)
    )
      throw conflict(error)
    return api.updateTodo(located.list.id, uid, fresh.etag, changes)
  }
}

const sameDue = (a: Todo['due'], b: Todo['due']): boolean =>
  a === undefined || b === undefined
    ? a === b
    : a.kind === b.kind &&
      a.value === b.value &&
      (a.kind !== 'zoned' || (b.kind === 'zoned' && a.tzid === b.tzid))

const pick = <T>(change: T | null | undefined, current: T | undefined) =>
  change === null ? undefined : change !== undefined ? change : current

const copyOf = (todo: Todo, changes: TodoChanges): NewTodo => {
  const due = pick(changes.due, todo.due)
  const description = pick(changes.description, todo.description)
  const priority = pick(changes.priority, todo.priority)
  const created = todo.created
  return {
    uid: todo.uid,
    summary: changes.summary ?? todo.summary,
    ...(due === undefined ? {} : { due }),
    ...(description === undefined ? {} : { description }),
    ...(priority === undefined ? {} : { priority }),
    ...(created === undefined ? {} : { created }),
  }
}

export const moveTodo = async (
  api: FoldApi,
  uid: string,
  targetName: string,
  changes: TodoChanges,
): Promise<LocatedTodo> => {
  const located = await resolveTodo(api, uid)
  const target = await resolveList(api, targetName)
  if (target.id === located.list.id)
    throw new CliError(
      'The todo is already in that list; --list names the destination',
      2,
    )
  if (located.todo.completed)
    throw new CliError(
      'Cannot move a completed todo; run todo uncomplete first',
      2,
    )
  const copy = copyOf(located.todo, changes)
  let created: Todo
  try {
    created = await api.createTodo(target.id, copy)
  } catch (error) {
    const existing = api.conflict(error)
    if (!existing) throw error
    created = existing
  }
  try {
    await api.deleteTodo(located.list.id, uid, located.todo.etag)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404)
      return { list: target, todo: created }
    if (api.conflict(error))
      throw new CliError(
        'The source changed after it was copied; inspect it and try again',
        4,
      )
    throw error
  }
  return { list: target, todo: created }
}

export const uncompleteTodo = async (
  api: FoldApi,
  located: LocatedTodo,
): Promise<Todo> => {
  const { list, todo } = located
  if (!todo.completed) return todo
  try {
    return await api.updateTodo(list.id, todo.uid, todo.etag, {
      completed: false,
    })
  } catch (error) {
    const fresh = api.conflict(error)
    if (!fresh) throw conflict(error)
    if (!fresh.completed) return fresh
    return api.updateTodo(list.id, todo.uid, fresh.etag, {
      completed: false,
    })
  }
}

export const completeTodo = async (
  api: FoldApi,
  uid: string,
  listName?: string,
): Promise<Todo> => {
  const located = await resolveTodo(api, uid, listName)
  if (located.todo.completed) return located.todo
  try {
    return await api.updateTodo(located.list.id, uid, located.todo.etag, {
      completed: true,
    })
  } catch (error) {
    const fresh = api.conflict(error)
    if (!fresh) throw conflict(error)
    if (fresh.completed) return fresh
    return api.updateTodo(located.list.id, uid, fresh.etag, { completed: true })
  }
}

export const deleteTodo = async (
  api: FoldApi,
  located: LocatedTodo,
): Promise<LocatedTodo> => {
  try {
    await api.deleteTodo(located.list.id, located.todo.uid, located.todo.etag)
    return located
  } catch (error) {
    if (api.conflict(error)) {
      throw new CliError(
        'The todo changed before it could be deleted; inspect it and try again',
        4,
      )
    }
    throw error
  }
}

export const resolveList = async (
  api: FoldApi,
  selector: string,
): Promise<TodoList> => {
  const lists = await api.lists()
  const byId = lists.filter((list) => list.id === selector)
  const [byIdMatch] = byId
  if (byId.length === 1 && byIdMatch) return byIdMatch
  const exact = lists.filter((list) => list.displayName === selector)
  const [exactMatch] = exact
  if (exact.length === 1 && exactMatch) return exactMatch
  const folded = selector.toLocaleLowerCase()
  const insensitive = lists.filter(
    (list) => list.displayName.toLocaleLowerCase() === folded,
  )
  const [insensitiveMatch] = insensitive
  if (insensitive.length === 1 && insensitiveMatch) return insensitiveMatch
  if (exact.length > 1 || insensitive.length > 1) {
    throw new CliError(
      `More than one Fold list is named ${JSON.stringify(selector)}`,
    )
  }
  throw new CliError(`No Fold list matches ${JSON.stringify(selector)}`)
}

export const resolveTodo = async (
  api: FoldApi,
  uid: string,
  listName?: string,
): Promise<LocatedTodo> => {
  const matches = (await listTodos(api, listName)).filter(
    ({ todo }) => todo.uid === uid,
  )

  const [match] = matches
  if (matches.length === 1 && match) return match
  if (matches.length > 1) {
    throw new CliError(
      `Todo UID ${JSON.stringify(uid)} exists in multiple lists; use --list`,
    )
  }
  throw new CliError(`No todo has UID ${JSON.stringify(uid)}`)
}

const conflict = (error: unknown): unknown => {
  if (error instanceof ApiError && error.status === 412) {
    return new CliError(
      'The todo changed concurrently; inspect it and try again',
      4,
    )
  }
  return error
}
