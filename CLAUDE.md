# CalDAV Todo Client — Agent Rules

Specifications live in [docs/specs](docs/specs/overview.md). Read
[docs/specs/overview.md](docs/specs/overview.md) before starting any task.

## Workflow

- Always lint (`oxlint`) and format (`oxfmt`) before committing.
- Linting is **type-aware** via `oxlint --type-aware`, which is powered by
  [tsgolint](https://github.com/oxc-project/tsgolint) (installed as the
  `oxlint-tsgolint` dev dependency). Fix findings, don't suppress them.
- Formatting: 80-character line length, no semicolons, dangling commas
  always. Enforced by oxfmt config — never hand-format against it.
- Don't duplicate tests across layers (unit / integration / e2e).
- Test behavior over shape — never test that a defined shape is what it is.

## Documentation

- Specifications are broken down by feature — one file per feature in
  `./docs/specs`. No single large spec file.
- Spec files carry **no** top-level timestamp. When changing a spec, annotate
  the change inline where it occurs: `*(changed YYYY-MM-DD: reason)*`.
- Every feature and every architecture decision gets its own documentation
  file: architecture decisions in `./docs/architecture`, user guide
  documentation in `./docs/user` — one file per topic.
- Documentation and code comments should reference the relevant spec file
  (and section) they implement.

## Technical

- Use zod for runtime validation with types inferred via `z.infer` — validate
  at every trust boundary (API in/out, outbox reads, env vars, CalDAV-derived
  data). No hand-written types that duplicate a schema.
- All tsconfigs extend `@tsconfig/strictest` (+ `@tsconfig/node24` for
  server/packages).
- Forms use react-hook-form with `@hookform/resolvers/zod`, reusing
  `packages/schemas`.
- API handlers are individual files — one route per file under
  `apps/server/src/api/<resource>/<action>.ts`, composed by a small router.
  No giant files.
- Generic, reusable, feature-complete code goes in `packages/` in publishable
  shape: own `package.json` with `exports`, own tests, no imports from
  `apps/`.
