import { Dialog } from '@base-ui/react/dialog'
import { useEffect, useState, type ReactNode } from 'react'
import { LuMenu } from 'react-icons/lu'
import { ListNav, useLists } from './lists/list-nav'
import { NavFooter } from './lists/nav-footer'
import styles from './main-screen.module.css'
import { cx } from './styles/cx'
import { TodoPane } from './todos/todo-pane'
import { useMediaQuery } from './use-media-query'

const SELECTED_LIST_KEY = 'caldav-todo:selected-list'
// Matches the `min-width: 768px` breakpoint in main-screen.module.css where
// the nav switches from an overlay drawer to a permanently pinned sidebar.
const DESKTOP_QUERY = '(min-width: 768px)'

export function MainScreen() {
  const lists = useLists()
  const [selected, setSelected] = useState<string | null>(() =>
    localStorage.getItem(SELECTED_LIST_KEY),
  )
  const [drawerOpen, setDrawerOpen] = useState(false)
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

  // docs/specs/ui.md — scrolling: inside the nav, the list of lists scrolls
  // while the footer (Settings, status) stays anchored. `.navScroll` is the
  // only child that overflows; `NavFooter` sits outside it so it never
  // scrolls out of view behind a long list.
  const navContent: ReactNode = (
    <>
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
        {isDesktop && <aside className={styles['nav']}>{navContent}</aside>}
        <main className={styles['main']}>
          {/* docs/specs/ui.md — mobile: the nav trigger sits beside the
              list title, forming the top row of the content column,
              rather than a floating button in a corner. The title stays
              centred above the list on every viewport; on desktop the nav
              is permanently pinned, so there's no trigger to render.
              docs/specs/ui.md — scrolling: this header is sticky so the
              list title and its controls stay in view; only .mainScroll
              beneath it scrolls. */}
          <div className={styles['header']}>
            {!isDesktop && drawer}
            <h1 className={styles['title']}>
              {activeList?.displayName ?? 'Todos'}
            </h1>
            <span className={styles['headerSpacer']} aria-hidden="true" />
          </div>
          <div className={styles['mainScroll']}>
            {active ? (
              <TodoPane listId={active} />
            ) : (
              <p className={styles['empty']}>Create a list to get started.</p>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
