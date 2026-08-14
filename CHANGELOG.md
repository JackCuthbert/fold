# Changelog

## [0.4.0](https://github.com/JackCuthbert/fold/compare/v0.3.0...v0.4.0) (2026-08-14)


### Features

* **client:** a Next 7 days view, and a tighter derived-view nav ([67aac6e](https://github.com/JackCuthbert/fold/commit/67aac6ed8727ff0afa1b59a3f171fe1e78b532e7))


### Bug Fixes

* **client:** grouped row weight and order, and a dot in the list picker ([812e262](https://github.com/JackCuthbert/fold/commit/812e262e5af808be0fcf4e2ea911081ed5a2ae50)), closes [#59](https://github.com/JackCuthbert/fold/issues/59)
* **client:** one amber and one red per priority rank ([4f62a58](https://github.com/JackCuthbert/fold/commit/4f62a58dfd02734520929f02c2a2353c8ffec520))
* **client:** the Low priority pill green, matching its picker ([7b25484](https://github.com/JackCuthbert/fold/commit/7b2548411920a5e982d3646def857f8cfc4d4a19))

## [0.3.0](https://github.com/JackCuthbert/fold/compare/v0.2.0...v0.3.0) (2026-08-11)


### Features

* **client:** a context menu on every todo row ([78b7397](https://github.com/JackCuthbert/fold/commit/78b73979c0d3c1963db45f688834d7b3f96fc19c))


### Documentation

* keep commit messages short, put the detail in the PR ([875ddab](https://github.com/JackCuthbert/fold/commit/875ddabc21b515da34cee97ace52d4a600344e4c))

## [0.2.0](https://github.com/JackCuthbert/fold/compare/v0.1.0...v0.2.0) (2026-08-11)


### Features

* **server:** cap failed sign-in attempts per target ([b3b8893](https://github.com/JackCuthbert/fold/commit/b3b8893a3b95eb145368577840b425e3deba7dfc))
* **server:** restrict which CalDAV hosts sign-in may reach ([2d0e5d7](https://github.com/JackCuthbert/fold/commit/2d0e5d7ad2a36a9f4b000b0d65a4cbc6ec12904b))
* **server:** send a strict CSP and security headers on every response ([27f1d67](https://github.com/JackCuthbert/fold/commit/27f1d67b6607890726a4f56d56def0d410073d78))


### Bug Fixes

* **client:** stack the New todo modal above the nav drawer ([90d86cc](https://github.com/JackCuthbert/fold/commit/90d86cc79fe02ee7eb41662e1289fa69279c48d4))
* stop oxfmt formatting the generated CHANGELOG.md ([bfe90c4](https://github.com/JackCuthbert/fold/commit/bfe90c4dbfed1224e8e8e8b3e74e2e576bcbb458))
* **vtodo:** name the project Fold in PRODID, with its version ([1072497](https://github.com/JackCuthbert/fold/commit/1072497965410af2a5cf1c77e247408072218e39))


### Documentation

* consolidate agent rules into CLAUDE.md ([73d1d5a](https://github.com/JackCuthbert/fold/commit/73d1d5afcb8f2238ab7d970bd2acd5500d6aeab9))
* fix the broken clone URL and the stale "no image published" claim ([2f1f692](https://github.com/JackCuthbert/fold/commit/2f1f692f27e91b09c64ab263115d97c804cbd906))
* tell self-hosters about the attempt cap and the headers ([d5d28fe](https://github.com/JackCuthbert/fold/commit/d5d28fe72e9f549b065a22fb4b123f8524844a6d))


### Build and dependencies

* **deps-dev:** bump the minor-and-patch group across 2 directories with 3 updates ([a3e1e36](https://github.com/JackCuthbert/fold/commit/a3e1e36b6b8c3fd7e133beba58cbaf8ee527e4e2))
* **deps-dev:** re-resolve the lockfile Dependabot left stale ([18f3ae6](https://github.com/JackCuthbert/fold/commit/18f3ae67e63c63e37eb29cd65109b031497d3dd4))

## 0.1.0 (2026-08-10)

The first published release, and the first image you can pull rather than
build.

Fold is a todo client for any spec-compliant CalDAV server. It stores
nothing itself: your todos live on your server, your session lives in an
encrypted cookie, and the offline queue lives in your browser.

### What is in it

- **Todos and lists** — due dates and times, priorities, notes, and
  multiple lists you can create, rename, colour and reorder. Properties
  written by other CalDAV clients survive an edit untouched.
- **Derived views** — Today, Tomorrow, Summary and Search, built over your
  lists rather than stored alongside them.
- **Lists that do more** — naming a list Groceries or Health unlocks
  grouping and bulk actions for it.
- **Offline-resilient** — every read and write works with no network, and
  queued changes replay when you are back.
- **Themes** — seven palettes with light and dark variants, and a choice
  of serif or sans, all self-hosted so nothing is fetched from a CDN.
- **Installable** — works as a PWA on iOS, with a session that survives
  being backgrounded.
- **Quiet by design** — no notifications, no badges, no streaks.

### Running it

```bash
docker pull ghcr.io/jackcuthbert/fold:0.1.0
```

See the [README](https://github.com/JackCuthbert/fold#running-it) for the
full setup, and
[docs/specs/deployment.md](https://github.com/JackCuthbert/fold/blob/main/docs/specs/deployment.md)
for configuration, HTTPS and health checks.

### A note on this entry

Everything above is the accumulated work of the project up to this point,
summarised rather than listed: the generated version ran to 209 commits,
which describes how Fold was built rather than what it does. Releases from
0.2.0 onward are generated from the commits since the previous release, so
they read as ordinary changelogs.
