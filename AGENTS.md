# Fold agent guide

This file is the authoritative repository guidance for coding agents.

## Commands

Run tooling through root scripts; do not invoke underlying binaries or invent
flags. Use the narrowest relevant checks first.

- `bun run lint`: type-aware lint
- `bun run fmt` / `bun run fmt:check`: formatting
- `bun run typecheck`: all workspace type checks
- `bun run test`: unit tests
- `bun run test:integration`: server integration tests
- `bun run test:e2e`: end-to-end tests and client build
- `bun run knip`: unused files, exports, and dependencies
- `bun run docs:build`: user guide build and link check

Batch related edits, then run the narrowest relevant checks once. Use interim or
broader checks only when needed. Before finishing code changes, run relevant
tests plus lint, typecheck, format check, and `bun run knip`; for documentation,
run `bun run docs:build`. Fix findings rather than suppressing them.

## Safety and deployment

- Never install software system-wide or user-wide. Add project dependencies to
  the appropriate manifest. CalDAV test infrastructure runs in Docker.
- Docker is the only deployment target. Do not add another target unless the
  task explicitly requires it.
- Keep `bun install --frozen-lockfile` in CI. Dependabot may leave native-binary
  entries stale; repair those updates with plain `bun install` and commit the
  lockfile.
- Dependency ranges must reflect the installed version and match across every
  manifest declaring the package. Workspaces using Node APIs must declare
  `@types/node` and set `"types": ["node"]`.
- Reproduce Docker, CI, or hosted-platform failures with that platform's own
  tooling when possible. Clearly label anything not reproduced as an inference.

## Architecture invariants

- Validate every trust boundary with Zod and infer types with `z.infer`; do not
  duplicate schemas as handwritten types. Boundaries include APIs, environment
  variables, outbox reads, and CalDAV-derived data.
- Forms use React Hook Form with the Zod resolver and reuse `packages/schemas`.
- Keep `apps/client/src` root files to entry points. Put code in an existing
  domain (`todos`, `lists`, `sync`, `auth`, etc.), `shell`, `ui`, `shortcuts`,
  `help`, `styles`, `hooks`, or `lib`; create a named domain when needed.
- Client component files, CSS Modules, and tests are colocated in component
  directories. Non-component helpers remain flat in domain `lib` or `hooks`.
  Server and package tests follow their existing top-level `test` trees.
- Add a domain barrel only for multiple external consumers and when it creates
  no cycle. Internal imports use direct paths, and barrels export only the
  domain's external API. Treat Knip warnings on barrel exports as an API-width
  problem, not automatically as dead implementation.
- Moving CSS Modules can break `composes: ... from` paths without failing unit
  tests or typecheck; run `bun run test:e2e` after such moves.
- Use CSS Modules beside components. Shared design tokens are CSS custom
  properties; do not add CSS-in-JS. Use one `react-icons` icon set and Base UI
  for accessible primitives.
- API handlers are one route per file under
  `apps/server/src/api/<resource>/<action>.ts`.
- Reusable code in `packages` must have a real app-independent boundary, its own
  exports and tests, and `"private": true`.

## Tests and generated assets

- Test behavior, not static shape, and do not duplicate coverage across unit,
  integration, and e2e layers.
- Timed e2e scenarios must allow generous CI headroom. Verify that a regression
  test fails without its fix.
- Do not hand-edit generated assets. `apps/client/public/favicon.svg` is the
  favicon source; run `bun run favicons` and commit all generated outputs.
- If UI changes affect README screenshots, run `bun run screenshot` and commit
  `docs/screenshot.png` and `docs/screenshot-quick-add.png`.

## Documentation map

Read only the documentation relevant to the task:

- `docs/specs/overview.md`: product overview and links to feature specifications
- `docs/specs/`: behavior and feature requirements
- `docs/architecture/`: cross-cutting architecture decisions
- `docs/development/`: contributor workflows, local CalDAV, and CLI testing
- `apps/docs/guide/`: user-facing documentation

Keep specifications split by feature. Specs may annotate changes inline as
`*(changed YYYY-MM-DD: reason)*`; do not add top-level timestamps. User guide
pages contain no change annotations or checkout-only contributor instructions.

## Git and review

- Keep one commit per cohesive feature or fix; squash/amend iteration before
  pushing.
- Use scoped Conventional Commits (`client`, `server`, `cli`, `docs`, package
  name, or `repo`) with a user-facing release-note subject.
- Do not add co-author or tool-attribution trailers.
- Do not hard-wrap GitHub issue or PR prose, and use GitHub-resolvable links.
