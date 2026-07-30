import type { Route } from './route'
import { createSession } from './session/create'
import { destroySession } from './session/destroy'

export const routes: Route[] = [createSession, destroySession]
