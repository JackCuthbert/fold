# Installing Fold as an app

Fold ships a [web app manifest](../../apps/client/public/manifest.webmanifest)
and the iOS-specific meta tags in
[index.html](../../apps/client/index.html), so it can be installed to a
phone's Home Screen and run without browser chrome.

*(added 2026-08-08.)*

## Why a PWA rather than a native app

Fold is a self-hosted client for a CalDAV server. A native iOS app would
mean an Apple Developer account, a build and signing pipeline, and either
TestFlight or the App Store for distribution — for an app whose entire job
is to talk to a server the user already runs. Installing the web app costs
one visit to the site and a tap.

The trade is real and worth stating plainly: a PWA on iOS gets a Home
Screen icon, a standalone window and offline support, and **not** the
things that need a native binary — see the limits below.

## What installing gets you

- **Its own icon and window.** No address bar, no tab strip; the app fills
  the display and appears in the app switcher as itself.
- **Offline.** Fold was already offline-first — the outbox queues writes
  and the query cache persists to IndexedDB
  ([sync-and-offline](../specs/sync-and-offline.md)) — and that behaviour
  carries into the installed app unchanged.
- **Its own storage, and its own login.** See the warning below.

## What iOS does not support

These are iOS limitations, not things left undone:

- **No push notifications** unless the app is installed to the Home Screen,
  and even then they need explicit permission and a service worker. Fold
  does not use them at all.
- **No background sync.** A backgrounded PWA does not run. Fold syncs when
  it is open and on the events it can see (focus, reconnect, interval —
  [sync-and-offline](../specs/sync-and-offline.md)); it cannot poll while
  closed the way a native app with a background refresh entitlement can.
- **No badge on the icon** for the outstanding count.
- **iOS ignores most of the manifest.** `display`, `name` and the status
  bar come from the `apple-mobile-web-app-*` meta tags instead, which is
  why both are declared. The manifest is what Android and desktop Chrome
  read.

## The separate cookie jar

**An installed PWA on iOS has its own storage, separate from Safari.**
Signing in inside Safari does not sign you in inside the installed app, and
vice versa — they are two independent sessions with two independent
IndexedDB stores.

This makes the session cookie's lifetime matter more, not less: an
installed app that logs itself out feels far more broken than a browser tab
that does. That is handled by the sliding 7-day cookie
([authentication](../specs/authentication.md) — session lifetime), which
was a real bug before it was a PWA concern.

## Installed icons are opaque; tab favicons are not

*(added 2026-08-08: `apple-touch-icon.png` was transparent with dark ink,
so on the iOS Home Screen it rendered black-on-black over a dark
wallpaper.)*

iOS does **not** composite a Home Screen icon onto white — it draws it
straight onto the wallpaper, and Android launchers do the same. So every
icon the manifest or `apple-touch-icon` declares carries an opaque paper
background, and is inset ~20% so the artwork clears the rounded corners
(iOS) or the circular crop (most Android launchers).

`favicon-32.png` is the deliberate exception: a tab favicon *wants*
transparency, so it takes the tab strip's own colour instead of carrying a
paper-coloured card into a dark theme.

`bun run favicons` enforces both by sampling the rendered pixels — it
fails if an icon comes out with under 2% ink. It previously checked file
size, which silently passed a blank *opaque* canvas (488 bytes, over the
400-byte floor).

## Safe areas

`viewport-fit=cover` lets the app paint edge to edge, under the notch and
the home indicator. `#root` then re-inserts that space with
`env(safe-area-inset-*)` (`styles/global.css`), so content stays clear of
both. The insets are zero in an ordinary browser tab, where Safari's own
chrome already reserves the space — so this costs nothing when not
installed.

**The layout inside must absorb those insets, not add to them.**
`#root` owns the viewport height (`height: 100dvh`) and the padding; the
`.layout`/`.body` chain fills it with `height: 100%`. Measuring `100dvh`
there instead — while sitting inside a padded parent — made the chain
`100dvh + top + bottom`, so the whole page scrolled by exactly the insets:
roughly 93px of scroll on an iPhone, in a view with nothing to scroll,
breaking the one thing this layout exists to guarantee
([ui](../specs/ui.md) — scrolling). *(fixed 2026-08-08.)*

Chromium reports every inset as `0`, so no amount of testing at a mobile
viewport reproduces this. `e2e/tests/safe-area.spec.ts` injects real
iPhone inset values and asserts the page still cannot scroll while the
list still can — it fails without the fix.

### Rounded corners are a separate problem

*(added 2026-08-08.)*

`safe-area-inset-left` / `-right` describe hardware that **intrudes** — the
notch, in landscape — and on a portrait iPhone they are both **0**. They
say nothing about the display's rounded corners, so the bottom row of a
view sat inside the curve, where it is widest.

The fix is **extra bottom padding only**: `--corner-inset-block-end`, added
to `env(safe-area-inset-bottom)` rather than `max()`-ed with it, since the
home indicator and the curve are different obstacles that happen to share
an edge. It is 0 by default and raised under `pointer: coarse`
(`styles/tokens.css`) — a browser window has square corners.

**Insetting the sides was tried and rejected.** A corner intrudes furthest
horizontally at the very bottom, so padding the left and right edges looks
like the obvious fix; it costs width on *every* row for a curve that only
bites at the last one, and reads as a margin rather than as clearance.
Lifting the bottom row into the straight part of the edge solves it without
touching the layout above.

### The overlays need it too

`#root`'s padding **cannot reach a portalled, fixed-position overlay** —
the mobile detail sheet and the nav drawer are both Base UI dialogs
portalled to `<body>`, so they resolve against the viewport, not their DOM
ancestor. Their bottom rows (the created/completed meta, the sync status
line) sat in the corner no matter how large `#root`'s padding grew, which
is why raising it appeared to do nothing at all.

**The clearance goes on the scrolling element, or on the element actually
pinned to the edge — never on the container that bounds them.** Padding the
container shrinks it, which produces one of two artefacts:

- On the detail sheet, padding `.popup` shortened the scroll *viewport*, so
  the last field was clipped at a hard line instead of scrolling past it —
  content appearing to emerge from nothing. It lives on `.form`, the
  scroller, where it is scrollable space.
- On the nav drawer, padding the drawer lifted the footer *and its top
  border* off the screen edge, leaving a band of bare paper below a divider
  meant to sit at the bottom. It lives on `.footer` itself, so the border
  stays put and only the text moves up.

Two further traps, both hit while fixing this:

- A `padding: 0` shorthand later in the same rule silently resets the
  safe-area padding. Order matters.
- A test that only measures elements *inside* `#root` passes happily while
  every overlay is broken.

## No service worker

Fold deliberately ships **no service worker**, and is therefore not
installable on Android or desktop Chrome, which require one. That is a
considered trade rather than an omission:

- The offline story is already handled a layer up, by the outbox and the
  persisted query cache. A service worker would add a *second*, separate
  cache with its own invalidation rules on top of that.
- A service worker caches the app shell, which means a stale shell is
  served until it updates itself. For a self-hosted app the user redeploys
  themselves, "why am I still on the old version?" is a bad failure to
  introduce.
- iOS — the platform this was actually asked for — installs happily
  without one.

If Android or desktop install support is wanted later, that is the piece
to add, and the shell-staleness question has to be answered as part of it.
