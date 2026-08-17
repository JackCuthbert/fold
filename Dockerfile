# Fold — production image (docs/specs/deployment.md).
#
# One image, one process: the BFF serves the built client *and* the JSON
# API from the same origin (apps/server/src/index.ts). That is not a
# packaging convenience — the session cookie is `SameSite=Strict`
# (apps/server/src/session/cookie.ts), so a split origin would drop it and
# nothing would stay logged in. Splitting the client onto a CDN means
# revisiting that cookie first.
#
# Pinned to the Bun the project develops against (`bun --version` → 1.3.14).
# Alpine, because the server has no native dependencies — it shells out to
# nothing and compiles nothing.
FROM oven/bun:1.3.14-alpine AS deps

WORKDIR /app

# Manifests only, so this layer is cached until a dependency actually
# changes — editing source doesn't re-resolve the tree. Every workspace
# manifest must be present or `bun install` can't link the workspace.
COPY package.json bun.lock ./
COPY apps/server/package.json ./apps/server/
COPY apps/client/package.json ./apps/client/
COPY apps/docs/package.json ./apps/docs/
COPY packages/schemas/package.json ./packages/schemas/
COPY packages/vtodo/package.json ./packages/vtodo/
COPY packages/outbox/package.json ./packages/outbox/
COPY e2e/package.json ./e2e/

# `--frozen-lockfile`: a build that quietly resolves a different tree than
# CI tested is not the thing CI tested. Fail instead.
RUN bun install --frozen-lockfile


# ---------------------------------------------------------------------------
# Build the client bundle. Separate from the runtime stage so Vite, React,
# and the whole dev toolchain stay out of the shipped image.
FROM deps AS build

COPY . .
RUN bun run --filter @fold/client build


# ---------------------------------------------------------------------------
# Runtime. Only what `bun src/index.ts` actually opens at run time.
FROM oven/bun:1.3.14-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

# Production dependencies only — Vite, Playwright, vitest, and oxlint are
# build-and-test tooling and have no business in a running container.
# Every workspace the root package.json declares must have its manifest
# present, even ones the image never runs: `bun install` resolves the whole
# workspace graph and fails outright on a missing member.
COPY package.json bun.lock ./
COPY apps/server/package.json ./apps/server/
COPY apps/client/package.json ./apps/client/
COPY apps/docs/package.json ./apps/docs/
COPY packages/schemas/package.json ./packages/schemas/
COPY packages/vtodo/package.json ./packages/vtodo/
COPY packages/outbox/package.json ./packages/outbox/
COPY e2e/package.json ./e2e/
RUN bun install --frozen-lockfile --production --filter @fold/server \
  && rm -rf ~/.bun/install/cache

# The server runs TypeScript directly, so "the build output" for the server
# is its source. Bun transpiles on load; there is no tsc step to mirror.
COPY apps/server/src ./apps/server/src
COPY packages/schemas ./packages/schemas
COPY packages/vtodo ./packages/vtodo
COPY packages/outbox ./packages/outbox

# The client bundle, at exactly the path index.ts resolves
# (`../../client/dist` relative to apps/server/src).
COPY --from=build /app/apps/client/dist ./apps/client/dist

# Drop root. The base image ships a `bun` user; nothing here writes to disk
# — the BFF is stateless, all state lives on the CalDAV server and in the
# browser (docs/specs/overview.md).
USER bun

EXPOSE 3000

# No shell form: `bun` becomes PID 1 and receives SIGTERM directly, so the
# container stops promptly instead of waiting out Docker's 10s kill timer.
CMD ["bun", "apps/server/src/index.ts"]
