import type { Route } from './route'
import { createList } from './lists/create'
import { listLists } from './lists/list'
import { removeList } from './lists/remove'
import { renameList } from './lists/rename'
import { createSession } from './session/create'
import { destroySession } from './session/destroy'
import { createTodo } from './todos/create'
import { listTodos } from './todos/list'
import { removeTodo } from './todos/remove'
import { updateTodo } from './todos/update'

export const routes: Route[] = [
  createSession,
  destroySession,
  listLists,
  createList,
  renameList,
  removeList,
  listTodos,
  createTodo,
  updateTodo,
  removeTodo,
]
