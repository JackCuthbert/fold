# The documentation site

The user guide is a [VitePress](https://vitepress.dev) site in `apps/docs`,
built from the markdown in `apps/docs/guide`. It is the source of truth for
user-facing documentation; `docs/specs` and `docs/architecture` are written
for whoever changes Fold and stay in the repo.

*(added 2026-08-17.)*

## Why a site rather than markdown in the repo

The guide is for people *using* Fold, and a private repo's markdown is not
reachable by them. A built site also brings search, a real navigation
structure, and rendered `<kbd>` keycaps — the guide leans on all three.

**This is not a second deployment target.** [deployment](./deployment.md)
stays Docker-only: the app ships as one image, and the docs site is a
separate static artifact that contains no application code and talks to
nothing.

## Where things live

```
apps/docs/
  guide/            The markdown, one file per topic — srcDir
    index.md        Home page (layout: home)
    public/         Static assets, symlinked (see below)
  .vitepress/
    config.ts       Nav, sidebar, base URL, dead-link policy
    theme/          Fold's palette over the default theme
```

Root scripts: `bun run docs` (dev), `docs:build`, `docs:preview`.

**Assets are symlinks, never copies.** `guide/public/` links to
`apps/client/public/favicon.svg`, `icon-192.png` and the two generated
screenshots in `docs/`. Those files have generators (`bun run favicons`,
`bun run screenshot`) and CLAUDE.md forbids hand-editing a generated asset;
copying one into the site would fork it silently the next time it is
regenerated. VitePress resolves the symlinks and emits real files.

**`public/` must sit inside `srcDir`.** With `srcDir: 'guide'`, VitePress
looks for `guide/public/`, not `apps/docs/public/` — a `public/` at the
package root is silently ignored and every asset 404s.

## The dead-link check

`ignoreDeadLinks` is on (the default), with one exemption for
`http://localhost` — the local-CalDAV-server page points at a server on the
reader's own machine, which is unreachable from a build by definition
rather than dead.

This is the check that catches a guide cross-link broken by a file move,
and it caught two on the first build. **Do not disable it to make a build
pass**; fix the link, or move the target back.

## Deployment

**Published at <https://jackcuthbert.github.io/fold/>** by
`.github/workflows/docs.yml`, which builds on every push and PR touching
the docs and deploys from `main`.

The deploy job is gated on the repo being public
(`needs.build.outputs.private == 'false'`), because Pages is not offered to
a private repo on a Free account:

| | Public repo | Private repo |
|---|---|---|
| **Free** | Pages works | Pages unavailable |
| **Pro** | Pages works | Pages works, site is public |
| **Enterprise Cloud** | Pages works | Site can require repo access |

The gate stays even though the repo is public. It reads
`github.event.repository.private` at run time, so it costs nothing and it
keeps the workflow honest if the repo is ever made private again. It
compares the string rather than using `fromJSON`, which throws on an empty
value; requiring exactly `'false'` fails closed.

**The build runs whether or not it deploys**, and earns its place:
`docs:build` fails on a dead internal link, so a broken guide cross-link is
caught on any PR that touches the docs.

**A Pages site is public even when its repo is private.** Private-repo
Pages hides the *source*, not the site. Restricting visitors to people with
repo access is Enterprise Cloud only. For a user guide that is the intent,
but it should be chosen rather than discovered.

*(changed 2026-08-17: the repo went public, Pages was enabled with Source
set to GitHub Actions — the one step that cannot be automated — and the
first deploy ran.)*

**`base` is the one line that must match the URL.** It is `'/fold/'` for
the default project page (`jackcuthbert.github.io/fold/`); a custom domain
needs `'/'` and a `CNAME` file. Get it wrong and every asset 404s while the
HTML still renders — the failure looks like a broken stylesheet, not a
misconfiguration.

If Pages stays unavailable and the guide needs publishing, Cloudflare Pages
and Netlify both build from a private repo on their free tiers; the build
command (`bun run docs:build`) and output directory
(`apps/docs/.vitepress/dist`) are the same wherever it runs.

## Writing for it

See CLAUDE.md — the short version is that the audience is someone using
Fold, so no `*(added …)*` annotations, and a page that only makes sense
from a repo checkout belongs in `docs/development/` instead.
