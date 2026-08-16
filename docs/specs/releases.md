# Releases

How a change becomes a version, a changelog entry, and an image someone
can pull.

*(added 2026-08-10.)*

## Versioning

[Semantic versioning](https://semver.org), driven by the Conventional
Commit messages this project already writes. `release-please` reads them
and does the arithmetic — `feat:` bumps the minor, `fix:` the patch — so
the version is a consequence of the commits rather than a judgement call.

**The first public release is 1.0.0.** Fold ran on 0.x while the
repository was private; those releases were cut against a history that has
since been squashed to a single commit, so their tags and SHAs no longer
exist and they are not part of the public record.

Going public is the compatibility promise: from 1.0.0 a breaking change
means a major bump rather than being absorbed into a minor one. That is
what people running the published image are entitled to expect, and it is
cheap to honour for an app whose data lives in their own CalDAV server.

Mechanically this means the manifest starts at `0.0.0` with
`initial-version: 1.0.0`, and **`bump-minor-pre-major` is deliberately
absent** — with it set, the first `feat:` would produce 0.1.0 rather than
1.0.0. *(changed 2026-08-17: was "Fold stays on 0.x", written while the
repo was private.)*

The root `package.json` holds the version; `release-please` syncs it into
every other manifest — `apps/client`, `apps/server`, `apps/docs`,
`packages/vtodo`, `packages/outbox` and `packages/schemas` — so nothing
drifts.

## Commit subjects are the changelog

`release-please` copies the subject line of every `feat:` and `fix:`
verbatim into `CHANGELOG.md` and the GitHub Release. **A commit message is
therefore a release note**, read by someone deciding whether to upgrade —
not a record of how the change was built.

Write what the app now does, in a user's words: *"add a todo by typing one
line"*, not *"add QuickAddModal with chrono-node parsing"*. Implementation
detail, rejected alternatives and measurements belong in the PR body or in
the relevant spec; see CLAUDE.md for the full rule.

The `changelog-sections` config hides `refactor`, `test`, `ci` and `chore`
from the published changelog, so those types can describe internal work
freely — they are never read by a user. *(added 2026-08-17.)*

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

### `CHANGELOG.md` is not formatted by oxfmt

It is listed in `.oxfmtrc.json`'s `ignorePatterns`, alongside `docs`.

release-please writes it, and writes it in its own house style: `*` list
bullets and a blank line after each heading. oxfmt wants `-` and no blank
line. Neither is wrong, but the file is regenerated on every release, so
the disagreement is permanent — the release PR failed `fmt:check` on
0.2.0 for exactly this, and would have failed on every release after it.

The alternatives were worse. Reformatting by hand is undone by the next
release. A CI step that reformats after generation adds a commit to a PR
whose whole value is being predictable. And the thing being argued over is
a bullet character in a generated file, which is not what the format check
exists to protect.

*(added 2026-08-11, from the 0.2.0 release PR.)*

## The image

Published to **`ghcr.io/jackcuthbert/fold`** on release, from the same
`Dockerfile` the project has always used ([deployment](./deployment.md)).

Tagged four ways: the exact version (`1.2.3`), the minor series (`1.2`),
the major series (`1`), and `latest`. **`1` is the tag worth pinning to** —
it follows every compatible release and stops at the next breaking change.

*(changed 2026-08-17: the bare major tag was deliberately absent while the
project was pre-1.0, because a `0` tag would have moved across breaking
changes — semver gives 0.x no compatibility guarantee, making it exactly
the tag someone would wrongly assume was safe to track. From 1.0 the
promise is real and the tag is useful.)*

**Built for `linux/amd64` and `linux/arm64`.** A large share of
self-hosters run this on a Raspberry Pi or an ARM NAS, where an amd64-only
image simply will not start. arm64 is emulated under QEMU and is slow to
build, which is affordable because it runs once per release.

**Signed build provenance is written but disabled.** The step is in the
workflow, commented out: attestations are not available for user-owned
*private* repositories, and it fails after the image has already pushed —
failing the run without failing the publish. Re-enable it when the
repository goes public, along with the `attestations: write` and
`id-token: write` permissions it needs.
*(disabled 2026-08-10, on the first release.)*

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
