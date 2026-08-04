import type { AppContext } from '../../src/api/route'
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
    },
    makeGateway: () => ({ ...base, ...gateway }),
  }
}
