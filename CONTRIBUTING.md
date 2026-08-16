# Contributing

Bug reports and fixes are genuinely welcome.

**Feature requests get weighed against one question: do I want it?** Fold
is personal software, so it may never do what you want, and that is the
point rather than an oversight. If you are about to build something large,
open an issue first; it would be a shame to write a feature that gets
declined on taste.

## Getting set up

You need [Bun](https://bun.sh) and Docker.

```bash
bun install
docker compose up -d        # a throwaway Radicale to develop against
```

Then two terminals:

```bash
SESSION_SECRET=$(openssl rand -hex 16) bun run --filter @fold/server dev
bun run --filter @fold/client dev
```

Open the Vite URL. On the login screen, **"Use demo server"** fills in the
local Radicale's credentials. It only renders in dev builds. See
[`docs/development/local-caldav-server.md`](docs/development/local-caldav-server.md).

## Before you open a PR

```bash
bun run lint          # oxlint, type-aware
bun run fmt           # oxfmt: 80 columns, no semicolons
bun run typecheck
bun run knip          # unused files, exports and dependencies
bun run test          # unit
bun run test:integration
bun run test:e2e
```

All of these run in CI, so it is quicker to run them here. **Always go
through the root scripts** rather than calling `oxlint`, `tsc` or `vitest`
directly. The scripts are the single source of truth for how those tools
are configured.

## Commit messages are release notes

`release-please` copies the subject line of every `feat:` and `fix:`
straight into `CHANGELOG.md` and the GitHub Release, where someone deciding
whether to upgrade will read it. So write for that person:

```
feat(client): add a todo by typing one line
fix(client): keep the due date when moving a todo between lists
```

Not how it was built:

```
feat(client): add QuickAddModal with chrono-node parsing
```

Keep the body short, or leave it out. Implementation detail, rejected
alternatives and measurements belong in the PR description, which is where
someone actually wants to read them. `refactor:`, `test:`, `ci:` and
`chore:` are hidden from the changelog, so those can describe internal work
freely.

Conventional Commits are load-bearing here: the type determines the version
bump, so a `feat:` that should have been a `fix:` ships a wrong version.

**One commit per feature or fix.** Iteration gets amended or squashed into
the change it belongs to rather than stacked as separate commits. That
covers review rounds, follow-up fixes, and "actually move it there".

## Tests

Test behaviour, not shape, and don't duplicate a case across unit,
integration and e2e. Pick the cheapest layer that can actually catch the
bug. [`docs/specs/testing.md`](docs/specs/testing.md) covers the split.

Most e2e specs run against an in-memory fake CalDAV gateway; one runs
against a real Radicale in Docker.

## Where things are written down

Every feature has a spec in [`docs/specs`](docs/specs/overview.md) and every
architecture decision one in [`docs/architecture`](docs/architecture), with
the reasoning and what was rejected. **If a change alters
behaviour, update the spec in the same PR.** The user guide lives in
[`apps/docs/guide`](apps/docs/guide) and is a VitePress site (`bun run
docs`).

[`CLAUDE.md`](CLAUDE.md) holds the full working rules, mostly written for
AI agents but accurate for anyone. It is candid about mistakes that have
already been made here, which is usually the fastest way to avoid repeating
them.
