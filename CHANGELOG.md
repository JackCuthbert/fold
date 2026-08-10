# Changelog

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
