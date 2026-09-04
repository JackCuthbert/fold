import { credentialsSchema } from '@fold/schemas'
import { defineCommand, renderUsage, runCommand } from 'citty'
import packageJson from '../package.json' with { type: 'json' }
import { FoldApi } from './api'
import { CliError } from './errors'
import { createPrompter, type Prompter } from './prompt'
import { createSessionStore, type SessionStore } from './session-store'
import {
  completeTodo,
  createTodo,
  deleteTodo,
  editTodo,
  listTodos,
  resolveTodo,
  type LocatedTodo,
} from './todos'

export interface RunDependencies {
  fetcher?: typeof fetch
  store?: SessionStore
  prompter?: Prompter
  stdout?: Pick<NodeJS.WriteStream, 'write'>
  stderr?: Pick<NodeJS.WriteStream, 'write'>
  env?: NodeJS.ProcessEnv
}

interface Runtime {
  fetcher: typeof fetch
  store: SessionStore
  prompter: Prompter
  stdout: Pick<NodeJS.WriteStream, 'write'>
  env: NodeJS.ProcessEnv
  json: boolean
}

const jsonArg = {
  type: 'boolean' as const,
  description: 'Write machine-readable JSON',
}

const helpArg = {
  type: 'boolean' as const,
  alias: 'h',
  description: 'Show help',
}

const listArg = {
  type: 'string' as const,
  description: 'List ID or display name',
  valueHint: 'list',
}

export const run = async (
  argv: string[],
  dependencies: RunDependencies = {},
): Promise<number> => {
  const stdout = dependencies.stdout ?? process.stdout
  const stderr = dependencies.stderr ?? process.stderr
  const runtime: Runtime = {
    fetcher: dependencies.fetcher ?? fetch,
    store: dependencies.store ?? createSessionStore(),
    prompter: dependencies.prompter ?? createPrompter(),
    stdout,
    env: dependencies.env ?? process.env,
    json: argv.includes('--json'),
  }
  const commands = createCommands(runtime)

  try {
    if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
      stdout.write(`${await helpFor(commands, argv)}\n`)
      return 0
    }
    if (argv.length === 1 && (argv[0] === '--version' || argv[0] === '-v')) {
      stdout.write(`${packageJson.version}\n`)
      return 0
    }
    await runCommand(commands.root, { rawArgs: argv })
    return 0
  } catch (error) {
    const cliError = normalizeError(error)
    if (runtime.json) {
      stderr.write(
        `${JSON.stringify({ error: cliError.message, exitCode: cliError.exitCode })}\n`,
      )
    } else {
      stderr.write(`Error: ${cliError.message}\n`)
    }
    return cliError.exitCode
  }
}

const createCommands = (runtime: Runtime) => {
  const login = defineCommand({
    meta: {
      name: 'fold auth login',
      description: 'Sign in and save the session',
    },
    args: {
      'fold-url': {
        type: 'string',
        description: 'Fold origin',
        valueHint: 'url',
      },
      'server-url': {
        type: 'string',
        description: 'CalDAV server URL',
        valueHint: 'url',
      },
      username: { type: 'string', description: 'CalDAV username' },
      json: jsonArg,
      help: helpArg,
    },
    run: async ({ args }) => {
      const previous = await runtime.store.load()
      const foldUrl = normalizeFoldUrl(
        args['fold-url'] ??
          runtime.env['FOLD_URL'] ??
          (await runtime.prompter.text('Fold URL', previous?.foldUrl)),
      )
      const serverUrl =
        args['server-url'] ??
        runtime.env['FOLD_CALDAV_URL'] ??
        (await runtime.prompter.text('CalDAV URL'))
      const username =
        args.username ??
        runtime.env['FOLD_USERNAME'] ??
        (await runtime.prompter.text('Username'))
      const password =
        runtime.env['FOLD_PASSWORD'] ??
        (await runtime.prompter.password('Password'))
      const credentials = credentialsSchema.parse({
        serverUrl,
        username,
        password,
      })
      const session = await FoldApi.login(
        foldUrl,
        credentials,
        runtime.store,
        runtime.fetcher,
      )
      emit(runtime, {
        message: `Signed in to Fold as ${terminalText(session.username)}`,
        session,
      })
    },
  })

  const status = defineCommand({
    meta: {
      name: 'fold auth status',
      description: 'Show the saved session status',
    },
    args: { json: jsonArg, help: helpArg },
    run: async () => {
      const session = await (await authenticated(runtime)).status()
      emit(runtime, {
        message: `Signed in as ${terminalText(session.username)}`,
        session,
      })
    },
  })

  const logout = defineCommand({
    meta: {
      name: 'fold auth logout',
      description: 'Sign out and remove the session',
    },
    args: { json: jsonArg, help: helpArg },
    run: async () => {
      await (await authenticated(runtime)).logout()
      emit(runtime, { message: 'Signed out of Fold' })
    },
  })

  const auth = defineCommand({
    meta: { name: 'fold auth', description: 'Manage authentication' },
    args: { json: jsonArg, help: helpArg },
    subCommands: { login, status, logout },
  })

  const list = defineCommand({
    meta: { name: 'fold todo list', description: 'List todos' },
    args: {
      list: listArg,
      'include-completed': {
        type: 'boolean',
        description: 'Include completed todos',
      },
      json: jsonArg,
      help: helpArg,
    },
    run: async ({ args }) => {
      const allTodos = await listTodos(await authenticated(runtime), args.list)
      const todos = args['include-completed']
        ? allTodos
        : allTodos.filter(({ todo }) => !todo.completed)
      const lines = todos.map(
        ({ list: todoList, todo }) =>
          `${todo.completed ? 'x' : ' '} ${terminalText(todo.uid)}  ${terminalText(todoList.displayName)}  ${terminalText(todo.summary)}`,
      )
      emit(runtime, { message: lines.join('\n') || 'No todos', todos })
    },
  })

  const view = defineCommand({
    meta: {
      name: 'fold todo view',
      description: 'Show every field of one todo',
    },
    args: {
      uid: { type: 'positional', description: 'Todo UID', required: true },
      list: listArg,
      json: jsonArg,
      help: helpArg,
    },
    run: async ({ args }) => {
      const located = await resolveTodo(
        await authenticated(runtime),
        args.uid,
        args.list,
      )
      emit(runtime, { message: todoDetails(located), ...located })
    },
  })

  const create = defineCommand({
    meta: { name: 'fold todo create', description: 'Create a todo' },
    args: {
      summary: {
        type: 'positional',
        description: 'Todo summary',
        required: true,
      },
      list: { ...listArg, required: true },
      json: jsonArg,
      help: helpArg,
    },
    run: async ({ args }) => {
      const todo = await createTodo(
        await authenticated(runtime),
        args.list,
        args.summary,
      )
      emit(runtime, {
        message: `Created ${terminalText(todo.summary)}`,
        todo,
      })
    },
  })

  const edit = defineCommand({
    meta: { name: 'fold todo edit', description: 'Change a todo summary' },
    args: {
      uid: { type: 'positional', description: 'Todo UID', required: true },
      summary: {
        type: 'string',
        description: 'New summary',
        required: true,
      },
      list: listArg,
      json: jsonArg,
      help: helpArg,
    },
    run: async ({ args }) => {
      const todo = await editTodo(
        await authenticated(runtime),
        args.uid,
        args.summary,
        args.list,
      )
      emit(runtime, {
        message: `Updated ${terminalText(todo.summary)}`,
        todo,
      })
    },
  })

  const complete = defineCommand({
    meta: { name: 'fold todo complete', description: 'Complete a todo' },
    args: {
      uid: { type: 'positional', description: 'Todo UID', required: true },
      list: listArg,
      json: jsonArg,
      help: helpArg,
    },
    run: async ({ args }) => {
      const todo = await completeTodo(
        await authenticated(runtime),
        args.uid,
        args.list,
      )
      emit(runtime, {
        message: `Completed ${terminalText(todo.summary)}`,
        todo,
      })
    },
  })

  const remove = defineCommand({
    meta: { name: 'fold todo delete', description: 'Delete a todo' },
    args: {
      uid: { type: 'positional', description: 'Todo UID', required: true },
      list: listArg,
      yes: { type: 'boolean', description: 'Skip confirmation' },
      json: jsonArg,
      help: helpArg,
    },
    run: async ({ args }) => {
      const api = await authenticated(runtime)
      const located = await resolveTodo(api, args.uid, args.list)
      if (!args.yes) {
        if (runtime.json) {
          throw new CliError('todo delete requires --yes when using --json', 2)
        }
        const confirmed = await runtime.prompter.confirm(
          `Delete ${JSON.stringify(located.todo.summary)}?`,
        )
        if (!confirmed) {
          emit(runtime, { message: 'Deletion cancelled' })
          return
        }
      }
      const deleted = await deleteTodo(api, located)
      emit(runtime, {
        message: `Deleted ${terminalText(deleted.todo.summary)}`,
        todo: deleted.todo,
      })
    },
  })

  const todo = defineCommand({
    meta: { name: 'fold todo', description: 'Manage todos' },
    args: { json: jsonArg, help: helpArg },
    subCommands: { list, view, create, edit, complete, delete: remove },
  })

  const root = defineCommand({
    meta: {
      name: 'fold',
      version: packageJson.version,
      description: packageJson.description,
    },
    args: {
      json: jsonArg,
      help: helpArg,
      version: {
        type: 'boolean',
        alias: 'v',
        description: 'Show version',
      },
    },
    subCommands: { auth, todo },
  })
  const leafHelp: Readonly<Record<string, () => Promise<string>>> = {
    'auth login': () => renderUsage(login),
    'auth status': () => renderUsage(status),
    'auth logout': () => renderUsage(logout),
    'todo list': () => renderUsage(list),
    'todo view': () => renderUsage(view),
    'todo create': () => renderUsage(create),
    'todo edit': () => renderUsage(edit),
    'todo complete': () => renderUsage(complete),
    'todo delete': () => renderUsage(remove),
  }

  return {
    root,
    help: {
      root: () => renderUsage(root),
      groups: {
        auth: () => renderUsage(auth),
        todo: () => renderUsage(todo),
      },
      leaves: leafHelp,
    },
  }
}

type Commands = ReturnType<typeof createCommands>

const helpFor = async (commands: Commands, argv: string[]): Promise<string> => {
  const groupName = argv.find((arg) => arg === 'auth' || arg === 'todo')
  if (!groupName) return commands.help.root()
  const groupIndex = argv.indexOf(groupName)
  const action = argv[groupIndex + 1]
  const leaf = action
    ? commands.help.leaves[`${groupName} ${action}`]
    : undefined
  return leaf ? leaf() : commands.help.groups[groupName]()
}

const authenticated = (runtime: Runtime): Promise<FoldApi> =>
  FoldApi.authenticated(runtime.store, runtime.fetcher)

const emit = (
  runtime: Runtime,
  result: { message: string } & Record<string, unknown>,
): void => {
  runtime.stdout.write(
    runtime.json ? `${JSON.stringify(result)}\n` : `${result.message}\n`,
  )
}

const normalizeError = (error: unknown): CliError => {
  if (error instanceof CliError) return error
  if (error instanceof Error && error.name === 'CLIError' && 'code' in error) {
    return new CliError(error.message, 2, { cause: error })
  }
  return new CliError(
    error instanceof Error ? error.message : 'Unexpected failure',
  )
}

const terminalText = (value: string): string =>
  JSON.stringify(value).slice(1, -1)

const normalizeFoldUrl = (input: string): string => {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new CliError('Fold URL must be a valid http or https URL', 2)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new CliError('Fold URL must use http or https', 2)
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new CliError(
      'Fold URL must be an origin without a path, query, or fragment',
      2,
    )
  }
  return url.origin
}

const todoDetails = ({ list, todo }: LocatedTodo): string =>
  [
    ['Summary', todo.summary],
    ['Description', todo.description ?? '(none)'],
    ['Status', todo.completed ? 'completed' : 'open'],
    ['Due', todo.due ? JSON.stringify(todo.due) : '(none)'],
    ['Priority', todo.priority ?? '(none)'],
    ['Created', todo.created ?? '(none)'],
    ['Completed at', todo.completedAt ?? '(none)'],
    ['UID', todo.uid],
    ['List', list.displayName],
    ['List ID', list.id],
    ['Href', todo.href],
    ['ETag', todo.etag],
  ]
    .map(([label, value]) => `${label}: ${terminalText(value ?? '')}`)
    .join('\n')
