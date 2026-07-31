# caldav-todo-client

A simple, offline-resilient todo client for any spec-compliant CalDAV
server (developed against Radicale). Bun BFF + React SPA.

## Quick start

```bash
bun install
SESSION_SECRET=$(openssl rand -hex 16) bun run --filter @caldav-todo/server dev
bun run --filter @caldav-todo/client dev   # second terminal
```

Open the Vite URL and sign in with your CalDAV server URL + credentials.

## Commands

| Command                        | What                                                |
| ------------------------------ | --------------------------------------------------- |
| `bun run lint` / `bun run fmt` | oxlint (type-aware, via tsgolint) / oxfmt           |
| `bun run typecheck`            | TS 7, strictest                                     |
| `bun run test`                 | unit tests (vitest)                                 |
| `bun run test:integration`     | gateway vs real Radicale (needs `radicale` on PATH) |
| `bun run test:e2e`             | Playwright happy paths (needs radicale + chromium)  |

## Docs

- Specifications: [docs/specs](docs/specs/overview.md)
- Architecture decisions: [docs/architecture](docs/architecture)
- User guide: [docs/user](docs/user/getting-started.md)
- Agent rules: [CLAUDE.md](CLAUDE.md)
