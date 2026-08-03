import { Dialog } from '@base-ui/react/dialog'
import { useEffect, useState, type ReactNode } from 'react'
import { LuMenu, LuOrigami } from 'react-icons/lu'
import { HelpModal } from './help-modal'
import { ListNav, useLists } from './lists/list-nav'
import { NavFooter } from './lists/nav-footer'
import { SettingsModal } from './lists/settings-modal'
import styles from './main-screen.module.css'
import { cx } from './styles/cx'
import { SummaryPane } from './todos/summary-pane'
import { TodayPane } from './todos/today-pane'
import {
  isDerivedView,
  isSummaryView,
  isTodayView,
  TODAY_VIEW,
} from './todos/today'
import { TodoPane } from './todos/todo-pane'
import { useAddTodo } from './todos/use-add-todo'
import { useMediaQuery } from './use-media-query'

const SELECTED_LIST_KEY = 'fold:selected-list'
// docs/specs/ui.md — the nav: collapsible on desktop too, pinned open by
// default (chosen as the least disruptive default — the desktop nav has
// always been visible, so opting *out* of it should be the explicit
// action). Persisted so a deliberate collapse survives a reload.
const NAV_PINNED_KEY = 'fold:nav-pinned'
// Matches the `min-width: 768px` breakpoint in main-screen.module.css where
// the nav switches from an overlay drawer to a permanently pinned sidebar.
const DESKTOP_QUERY = '(min-width: 768px)'

export function MainScreen() {
  const lists = useLists()
  const [selected, setSelected] = useState<string | null>(() =>
    localStorage.getItem(SELECTED_LIST_KEY),
  )
  const [drawerOpen, setDrawerOpen] = useState(false)
  // Settings lives here, not in NavFooter, for the same reason the other
  // dialogs do: on mobile the footer renders inside the drawer's
  // Dialog.Popup, so a modal owned there is a *nested* dialog — Base UI
  // suppresses a nested dialog's backdrop by design, which cost Settings
  // both its scrim and its click-outside-to-close. Rendered below as a
  // sibling of the drawer, it's a top-level dialog at every viewport.
  // *(fixed 2026-08-01.)*
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Help lives here for exactly the reason Settings does — see above. It is
  // opened from the same nav footer, so a modal owned there would be nested
  // inside the drawer's Dialog on mobile and lose its backdrop too.
  // *(added 2026-08-03.)*
  const [helpOpen, setHelpOpen] = useState(false)
  const [navPinned, setNavPinned] = useState<boolean>(
    () => localStorage.getItem(NAV_PINNED_KEY) !== '0',
  )
  // On desktop the nav is a permanently pinned sidebar, not a dialog — it's
  // plain markup, CSS-driven exactly as before. On mobile it's a true
  // overlay: Base UI's Dialog takes over the focus trap, scroll lock,
  // Escape-to-close and focus restoration that were previously hand-rolled
  // here (docs/specs/ui.md — prefer Base UI over hand-rolling focus
  // management). The trigger is a Dialog.Trigger (rather than a plain
  // button with manual state) so Base UI's floating tree knows about it —
  // without that wiring, its focus guards can't redirect a Tab that
  // reaches the trigger back into the trap.
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const desktopNavOpen = isDesktop && navPinned

  const toggleDesktopNav = (): void => {
    const next = !navPinned
    setNavPinned(next)
    localStorage.setItem(NAV_PINNED_KEY, next ? '1' : '0')
  }

  // The persisted list may no longer exist (deleted here or elsewhere).
  // Only trust it once we've actually seen the list index: assuming it's
  // valid while `lists.data` is undefined made every load fetch todos for
  // a possibly-deleted list, which 404s on every retry
  // (docs/specs/api.md — error mapping).
  // docs/specs/today-view.md — Today is the default view and the fallback
  // when a persisted list id no longer exists, so selection never lands on
  // an arbitrary list.
  const selectedExists =
    selected !== null &&
    (isDerivedView(selected) ||
      (lists.data?.some((l) => l.id === selected) ?? false))
  const active = (selectedExists ? selected : null) ?? TODAY_VIEW
  const showingToday = isTodayView(active)
  const showingSummary = isSummaryView(active)
  const showingDerived = isDerivedView(active)
  const activeList = lists.data?.find((list) => list.id === active)
  // A derived view has no collection to add to, so the add path is bound
  // to '' — its trigger isn't rendered either way (docs/specs/today-view.md,
  // docs/specs/summary-view.md).
  const add = useAddTodo(showingDerived ? '' : (active ?? ''))

  // Drop a persisted id the server no longer knows about, so it can't come
  // back on the next load.
  useEffect(() => {
    if (!lists.data || selected === null) return
    // A derived view is not a collection, so it is never "missing" from
    // the index (docs/specs/today-view.md, docs/specs/summary-view.md).
    if (isDerivedView(selected)) return
    if (!lists.data.some((list) => list.id === selected)) {
      localStorage.removeItem(SELECTED_LIST_KEY)
      setSelected(null)
    }
  }, [lists.data, selected])

  const selectList = (listId: string): void => {
    setSelected(listId)
    localStorage.setItem(SELECTED_LIST_KEY, listId)
  }

  // docs/specs/ui.md — the nav has a title above its list of lists, so the
  // panel is labelled rather than starting abruptly. docs/specs/ui.md —
  // overlays: a divider separates a title from its content in modals and
  // side panels — `.navTitle`'s border-bottom is that divider.
  // docs/specs/ui.md — scrolling: inside the nav, the list of lists scrolls
  // while the title and footer (Settings, status) stay anchored.
  // `.navScroll` is the only child that overflows.
  const navContent: ReactNode = (
    <>
      {/* docs/specs/ui.md — the nav is headed by the app's own mark rather
          than a section label: with Today, Summary and the lists all below
          it, "Lists" only described part of what follows. Origami for the
          folded paper the name means. *(changed 2026-08-02.)* */}
      <h2 className={styles['navTitle']}>
        <LuOrigami aria-hidden="true" size={18} />
        Fold
      </h2>
      <div className={styles['navScroll']}>
        <ListNav
          selected={active}
          onSelect={(listId) => {
            selectList(listId)
            setDrawerOpen(false)
          }}
        />
      </div>
      <NavFooter
        onOpenHelp={() => {
          setDrawerOpen(false)
          setHelpOpen(true)
        }}
        onOpenSettings={() => {
          // Close the drawer first: on mobile it's an overlay in its own
          // right, and leaving it open behind Settings would stack two
          // scrims and two focus traps. On desktop the nav is plain markup
          // and `drawerOpen` is already false, so this is a no-op there.
          setDrawerOpen(false)
          setSettingsOpen(true)
        }}
      />
    </>
  )

  // docs/specs/ui.md — overlays: every overlay dims the background.
  // Base UI never renders a nested dialog's backdrop (by design — see the
  // "Nested dialogs" section of its docs), so the nav drawer's Dialog.Root
  // must NOT wrap the rest of the page: anything inside it (detail sheet,
  // add-todo modal, confirm dialogs, settings) would be misdetected as
  // "nested" the moment it opens, even with the drawer itself closed, and
  // silently lose its own backdrop. Dialog.Root here wraps only the
  // trigger + its own portal — `<main>` is a sibling, outside the tree.
  const drawer = (
    <Dialog.Root open={!isDesktop && drawerOpen} onOpenChange={setDrawerOpen}>
      <Dialog.Trigger className={cx(styles['menuTrigger'])} aria-label="Lists">
        <LuMenu aria-hidden="true" size={20} />
      </Dialog.Trigger>
      {!isDesktop && (
        <Dialog.Portal>
          <Dialog.Backdrop className={cx(styles['scrim'])} />
          <Dialog.Popup render={<aside />} className={cx(styles['navOpen'])}>
            {navContent}
          </Dialog.Popup>
        </Dialog.Portal>
      )}
    </Dialog.Root>
  )

  return (
    <div className={styles['layout']}>
      {/* Siblings of `drawer`, never inside it — see `settingsOpen` above. */}
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
      <HelpModal open={helpOpen} onOpenChange={setHelpOpen} />
      <div className={styles['body']}>
        {/* docs/specs/ui.md — the nav is collapsible on desktop too, not
            only on mobile, opening to the same comfortable width at both
            sizes (`.nav`'s width in main-screen.module.css matches
            `.navOpen`'s `min(80vw, 20rem)` exactly). Plain markup, not a
            dialog — the desktop nav was never an overlay and doesn't need
            a scrim, focus trap or Escape-to-close; toggling it is a layout
            change, not opening/closing a surface.
            docs/specs/ui.md — overlays: the desktop nav animates too, with
            the same duration/easing as the mobile drawer. Always mounted
            (rather than conditionally rendered) so collapsing/expanding is
            a width transition, not an instant mount/unmount; hidden from
            assistive tech and unreachable by Tab while collapsed, matching
            the mobile drawer's closed state. */}
        {isDesktop && (
          <aside
            className={cx(
              styles['nav'],
              !desktopNavOpen && styles['navCollapsed'],
            )}
            aria-hidden={!desktopNavOpen}
            inert={!desktopNavOpen}
          >
            <div className={styles['navInner']}>{navContent}</div>
          </aside>
        )}
        <main className={styles['main']}>
          {/* docs/specs/ui.md — mobile: the nav trigger sits beside the
              list title, forming the top row of the content column,
              rather than a floating button in a corner. The title stays
              centred above the list on every viewport. On desktop a
              matching toggle collapses/expands the pinned sidebar.
              docs/specs/ui.md — scrolling: this header is sticky so the
              list title, nav toggle and "Add a todo" stay in view; only
              .mainScroll beneath it scrolls. */}
          <div className={styles['header']}>
            <div className={styles['headerRow']}>
              {!isDesktop && drawer}
              {isDesktop && (
                <button
                  type="button"
                  className={cx(styles['menuTrigger'])}
                  aria-label="Lists"
                  aria-pressed={desktopNavOpen}
                  onClick={toggleDesktopNav}
                >
                  <LuMenu aria-hidden="true" size={20} />
                </button>
              )}
              <h1 className={styles['title']}>
                {/* docs/specs/lists.md — colours: the list's dot travels
                    with its title, so the colour is still there while you
                    are looking at the list (issue #12). Only for a real
                    list, and only when it has a colour — a derived view is
                    not a collection and has none, and an uncoloured list
                    gets nothing rather than the nav's empty ring (see
                    `.titleDot`). */}
                {activeList?.color !== undefined && (
                  <span
                    className={styles['titleDot']}
                    style={{ background: activeList.color }}
                    aria-hidden="true"
                  />
                )}
                {showingToday
                  ? 'Today'
                  : showingSummary
                    ? 'Summary'
                    : (activeList?.displayName ?? 'Todos')}
              </h1>
              <span className={styles['headerSpacer']} aria-hidden="true" />
            </div>
          </div>
          <div className={styles['mainScroll']}>
            <div className={styles['mainScrollInner']}>
              {/* Keyed by view so switching remounts the pane, replaying
                  its fade-in (todo-pane.module.css — `.pane`). Without this
                  React reuses the same element and the animation only ever
                  runs once, on first render. */}
              {showingToday ? (
                <TodayPane key={active} lists={lists.data ?? []} />
              ) : showingSummary ? (
                <SummaryPane key={active} lists={lists.data ?? []} />
              ) : activeList ? (
                <TodoPane key={active} listId={activeList.id} add={add} />
              ) : (
                <p className={styles['empty']}>Create a list to get started.</p>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
