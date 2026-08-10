# Releases

How a change becomes a version, a changelog entry, and an image someone
can pull.

*(added 2026-08-10.)*

## Versioning

[Semantic versioning](https://semver.org), driven by the Conventional
Commit messages this project already writes. `release-please` reads them
and does the arithmetic — `feat:` bumps the minor, `fix:` the patch — so
the version is a consequence of the commits rather than a judgement call.

**Fold stays on 0.x.** Under 1.0 semver makes no compatibility promise,
which is the honest position for personal software whose README weighs
feature requests against "do I want it?". `bump-minor-pre-major` keeps a
breaking change at a minor bump (0.4.0 → 0.5.0) instead of forcing 1.0.0
before the project is ready to mean it.

The root `package.json` holds the version; `release-please` syncs it into
`apps/client` and `apps/server` so nothing drifts.

## The release PR is the gate

`release-please` keeps one PR open — *"chore: release X.Y.Z"* — and
updates it as commits land on `main`. It accumulates the changelog and the
version bump, and **nothing is published until it is merged**.

That matters more than automation would: merging is a deliberate act, so a
release happens when it is meant to rather than every time a `fix:` lands.
Merging tags the commit, writes `CHANGELOG.md`, cuts a GitHub Release, and
triggers the image build.

Commit types map to changelog sections in `release-please-config.json`.
`refactor`, `test`, `ci` and `chore` are hidden — real changes to the
project, but not ones a person deciding whether to upgrade needs to read.

## The image

Published to **`ghcr.io/jackcuthbert/fold`** on release, from the same
`Dockerfile` the project has always used ([deployment](./deployment.md)).

Tagged three ways: the exact version (`0.2.1`), the minor series
(`0.2`), and `latest`. There is deliberately **no bare major tag** while
under 1.0 — a `0` tag would move across breaking changes, since semver
gives 0.x no compatibility guarantee, and that is exactly the tag someone
would wrongly assume was safe to track.

**Built for `linux/amd64` and `linux/arm64`.** A large share of
self-hosters run this on a Raspberry Pi or an ARM NAS, where an amd64-only
image simply will not start. arm64 is emulated under QEMU and is slow to
build, which is affordable because it runs once per release.

Each image carries **signed build provenance**, so a puller can verify it
was built by this workflow from this repository rather than pushed by
hand.

## Version in the app

The running version is shown in the **Help modal**, in its own section
between the keyboard shortcuts and "How Fold works", read from the root
`package.json` — which the runtime image already contains, so there is no
build argument to forget and no way for the displayed version to disagree
with what is running.

### The update check is off by default

Fold otherwise talks to exactly one host: the user's own CalDAV server.
An update check breaks that, so it is **opt-in** — `CHECK_FOR_UPDATES`,
unset by default. A deployment that has not asked for it makes no outbound
call, which is the property a self-hosted app should keep by default.

When enabled, the **server** performs the check and caches the result; the
browser never contacts GitHub. That keeps the client's request pattern
unchanged and means one call per deployment rather than one per user.

**It appears in the Help modal and nowhere else.** No badge, no toast, no
dot on an icon anywhere in the app frame. The product's stated intent is
"no notifications, no badges, no streaks" ([overview](./overview.md)), and
an upgrade prompt that follows you around would contradict it. Someone who
wants to know goes and looks; someone who doesn't is never interrupted.

**Colour carries the state, not prose.** One line — a dot, the version, and
a *Release notes* link:

```
● Fold 0.1.0                                        Release notes
● Fold 0.1.0 · v0.3.0 available                     Release notes
```

Green means this is the current release; amber means a newer one exists.
The same two tokens as the sync dot in the nav footer, so the colours mean
the same thing in both places — and **amber rather than red**, because
running a version behind is a choice, not a fault. Red is reserved for
"disconnected", where something is actually broken.

Nothing explains *how* to upgrade: someone self-hosting a container knows
how to pull an image, and the release notes are one click away. The link
is named for what it is rather than what it answers, so it reads correctly
whether or not there is an update.

The dot's meaning is also carried by a visually-hidden sentence, because
the app's rule is that state is never conveyed by colour alone
(`ui/status-dot`). *(added 2026-08-10.)*
