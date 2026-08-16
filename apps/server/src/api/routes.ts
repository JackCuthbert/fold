import type { Route } from './route'
import { createList } from './lists/create'
import { listLists } from './lists/list'
import { removeList } from './lists/remove'
import { patchList } from './lists/patch'
import { createSession } from './session/create'
import { destroySession } from './session/destroy'
import { getSession } from './session/get'
import { createTodo } from './todos/create'
import { listTodos } from './todos/list'
import { removeTodo } from './todos/remove'
import { updateTodo } from './todos/update'
import { getVersion } from './version/get'

export const routes: Route[] = [
  createSession,
  destroySession,
  getSession,
  listLists,
  createList,
  patchList,
  removeList,
  listTodos,
  createTodo,
  updateTodo,
  removeTodo,
  getVersion,
]
