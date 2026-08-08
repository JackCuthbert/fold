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
