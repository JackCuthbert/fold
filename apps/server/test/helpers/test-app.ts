import type { AppContext } from '../../src/api/route'
import { makeAttemptLimiter } from '../../src/auth/attempt-limit'
import type { CaldavGateway } from '../../src/caldav/gateway'

export const TEST_SECRET = 'a-test-secret-at-least-16-chars'

const throwing = () => {
  throw new Error('gateway method not stubbed for this test')
}

export function testApp(gateway?: Partial<CaldavGateway>): AppContext {
  const base: CaldavGateway = {
    login: throwing,
    fetchLists: throwing,
    createList: throwing,
    renameList: throwing,
    setListProps: throwing,
    deleteList: throwing,
    fetchTodos: throwing,
    fetchTodo: throwing,
    createTodo: throwing,
    updateTodo: throwing,
    deleteTodo: throwing,
  }
  return {
    config: {
      PORT: 0,
      SESSION_SECRET: TEST_SECRET,
      NODE_ENV: 'development',
      ALLOW_INSECURE_COOKIE: false,
      CHECK_FOR_UPDATES: false,
    },
    makeGateway: () => ({ ...base, ...gateway }),
    // Off, matching the default: a unit test must never reach the network.
    checkForUpdate: () => Promise.resolve(null),
    // A fresh limiter per app, so one test's failed sign-ins can never
    // lock out the next (docs/specs/security.md).
    signInAttempts: makeAttemptLimiter(),
  }
}
