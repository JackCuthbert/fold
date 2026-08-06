import { useEffect, useState } from 'react'
import { useMediaQuery } from '../../hooks/use-media-query'

// docs/specs/ui.md — the nav: collapsible on desktop too, pinned open by
// default (chosen as the least disruptive default — the desktop nav has
// always been visible, so opting *out* of it should be the explicit
// action). Persisted so a deliberate collapse survives a reload.
const NAV_PINNED_KEY = 'fold:nav-pinned'

// Matches the `min-width: 768px` breakpoint in main-screen.module.css where
// the nav switches from an overlay drawer to a permanently pinned sidebar.
const DESKTOP_QUERY = '(min-width: 768px)'

// docs/specs/ui.md — the nav: below this width, opening the detail panel
// auto-collapses the nav rather than letting three fixed columns crush the
// list. Derived, not chosen by eye: `.main`'s reading column is `--measure`
// (34rem/544px) plus `--space-4` (16px) of padding either side = 576px, the
// width at which it stops gaining any usable reading space. Add the two
// fixed columns either side — the nav's 20rem (320px) and the detail
// panel's 24rem (384px) — and 320 + 576 + 384 = 1280px is the narrowest
// viewport where all three coexist without `.main` being squeezed below its
// designed measure. Below it, something has to give, and the nav is the
// column that is one tap away. *(added 2026-08-03: between 768px and this
// threshold, `.main` fell to 96px at 800px and 396px at 1100px whenever a
// todo was open — measured; todo rows begin clipping their summary below
// roughly 440px.)*
const THREE_COLUMN_QUERY = '(min-width: 1280px)'

export interface NavLayout {
  /** True at >=768px, where the nav is a pinned column rather than a drawer. */
  isDesktop: boolean
  /** The pinned sidebar is currently showing. */
  desktopNavOpen: boolean
  /** The ☰ opens the overlay drawer rather than toggling the column. */
  drawerAvailable: boolean
  drawerOpen: boolean
  setDrawerOpen: (open: boolean) => void
  /** Toggle the stored preference. Only meaningful while pinned. */
  toggleDesktopNav: () => void
}

/**
 * Where the nav is and what the ☰ does, at this viewport.
 *
 * Extracted from MainScreen (issue #28). The rules are geometric and
 * interlocking, and reading them off five separate `const`s scattered
 * between unrelated state was the hardest part of that file to hold in
 * your head.
 *
 * **`navPinned` and `desktopNavOpen` are two distinct concepts, deliberately
 * not one boolean** (docs/specs/ui.md — the nav). `navPinned` is what the
 * user *wants* and is the only thing persisted; `desktopNavOpen` is what is
 * *currently shown*.
 *
 * Below the three-column threshold, an open detail panel collapses the nav
 * — three fixed columns don't fit, and the alternative measured at 96px of
 * list. That collapse is never written to localStorage: it is a response to
 * the current viewport, not a choice the user made, so it must not follow
 * them to their next visit at a width where it would make no sense. It
 * reverses on its own — close the panel or widen past the threshold and the
 * nav returns, unless the user had collapsed it themselves, in which case
 * `navPinned` is already false and there is nothing to restore.
 * *(added 2026-08-03.)*
 */
export function useNavLayout(options: { detailOpen: boolean }): NavLayout {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [navPinned, setNavPinned] = useState<boolean>(
    () => localStorage.getItem(NAV_PINNED_KEY) !== '0',
  )
  // On desktop the nav is a permanently pinned sidebar, not a dialog — it's
  // plain markup, CSS-driven. On mobile it's a true overlay: Base UI's
  // Dialog takes over the focus trap, scroll lock, Escape-to-close and
  // focus restoration that were previously hand-rolled (docs/specs/ui.md —
  // prefer Base UI over hand-rolling focus management).
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const hasRoomForThree = useMediaQuery(THREE_COLUMN_QUERY)

  const autoCollapsed = !hasRoomForThree && options.detailOpen
  const desktopNavOpen = isDesktop && navPinned && !autoCollapsed

  // While auto-collapsed the ☰ opens the nav as the **drawer** — the same
  // overlay used on mobile — rather than re-expanding the pinned column.
  //
  // Expanding the column here would defeat the whole point: it would take
  // its 320px back out of a main column that was already too narrow, which
  // is the crush this auto-collapse exists to prevent. Measured: forcing
  // the column open at 1024px with a todo open dropped main to 320px, worse
  // than the 639px it had while collapsed. An overlay costs main nothing.
  //
  // *(fixed 2026-08-03: the override re-expanded the pinned column.)*
  const navAsDrawer = isDesktop && autoCollapsed

  // Close the drawer once the auto-collapse that prompted it lifts —
  // closing the todo, or widening past the threshold — so a drawer opened
  // for a narrow layout doesn't hang over a layout that no longer needs it.
  useEffect(() => {
    if (!autoCollapsed && drawerOpen && isDesktop) setDrawerOpen(false)
  }, [autoCollapsed, drawerOpen, isDesktop])

  return {
    isDesktop,
    desktopNavOpen,
    drawerAvailable: !isDesktop || navAsDrawer,
    drawerOpen,
    setDrawerOpen,
    // Only reachable when the nav is a pinned column — while auto-collapsed
    // the header renders the drawer's own trigger instead, so opening the
    // nav there never touches the stored preference.
    toggleDesktopNav: () => {
      const next = !navPinned
      setNavPinned(next)
      localStorage.setItem(NAV_PINNED_KEY, next ? '1' : '0')
    },
  }
}
