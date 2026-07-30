import type { Route } from './route'
import { createList } from './lists/create'
import { listLists } from './lists/list'
import { removeList } from './lists/remove'
import { renameList } from './lists/rename'
import { createSession } from './session/create'
import { destroySession } from './session/destroy'

export const routes: Route[] = [
  createSession,
  destroySession,
  listLists,
  createList,
  renameList,
  removeList,
]
