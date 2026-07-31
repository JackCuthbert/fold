import { Dialog } from '@base-ui/react/dialog'
import { useEffect, useState, type ReactNode } from 'react'
import { LuMenu } from 'react-icons/lu'
import { ListNav, useLists } from './lists/list-nav'
import { NavFooter } from './lists/nav-footer'
import styles from './main-screen.module.css'
import { cx } from './styles/cx'
import { AddTodoTrigger } from './todos/add-todo-trigger'
import { TodoPane } from './todos/todo-pane'
import { useAddTodo } from './todos/use-add-todo'
import { useMediaQuery } from './use-media-query'

const SELECTED_LIST_KEY = 'caldav-todo:selected-list'
// docs/specs/ui.md — the nav: collapsible on desktop too, pinned open by
// default (chosen as the least disruptive default — the desktop nav has
// always been visible, so opting *out* of it should be the explicit
// action). Persisted so a deliberate collapse survives a reload.
const NAV_PINNED_KEY = 'caldav-todo:nav-pinned'
// Matches the `min-width: 768px` breakpoint in main-screen.module.css where
// the nav switches from an overlay drawer to a permanently pinned sidebar.
const DESKTOP_QUERY = '(min-width: 768px)'

export function MainScreen() {
  const lists = useLists()
  const [selected, setSelected] = useState<string | null>(() =>
    localStorage.getItem(SELECTED_LIST_KEY),
  )
  const [drawerOpen, setDrawerOpen] = useState(false)
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
  const selectedExists =
    selected !== null && (lists.data?.some((l) => l.id === selected) ?? false)
  const active =
    (selectedExists ? selected : null) ?? lists.data?.[0]?.id ?? null
  const activeList = lists.data?.find((list) => list.id === active)
  const add = useAddTodo(active ?? '')

  // Drop a persisted id the server no longer knows about, so it can't come
  // back on the next load.
  useEffect(() => {
    if (!lists.data || selected === null) return
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
      <h2 className={styles['navTitle']}>Lists</h2>
      <div className={styles['navScroll']}>
        <ListNav
          selected={active}
          onSelect={(listId) => {
            selectList(listId)
            setDrawerOpen(false)
          }}
        />
      </div>
      <NavFooter />
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
      <div className={styles['body']}>
        {/* docs/specs/ui.md — the nav is collapsible on desktop too, not
            only on mobile, opening to the same comfortable width at both
            sizes (`.nav`'s width in main-screen.module.css matches
            `.navOpen`'s `min(80vw, 20rem)` exactly). Plain markup, not a
            dialog — the desktop nav was never an overlay and doesn't need
            a scrim, focus trap or Escape-to-close; toggling it is a layout
            change, not opening/closing a surface. */}
        {desktopNavOpen && (
          <aside className={styles['nav']}>{navContent}</aside>
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
                {activeList?.displayName ?? 'Todos'}
              </h1>
              <span className={styles['headerSpacer']} aria-hidden="true" />
            </div>
            {active && <AddTodoTrigger {...add} />}
          </div>
          <div className={styles['mainScroll']}>
            <div className={styles['mainScrollInner']}>
              {active ? (
                <TodoPane listId={active} add={add} />
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
