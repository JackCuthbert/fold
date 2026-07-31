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

  const navContent: ReactNode = (
    <>
      <ListNav
        selected={active}
        onSelect={(listId) => {
          selectList(listId)
          setDrawerOpen(false)
        }}
      />
      <NavFooter />
    </>
  )

  return (
    <Dialog.Root open={!isDesktop && drawerOpen} onOpenChange={setDrawerOpen}>
      <div className={styles['layout']}>
        <Dialog.Trigger
          className={cx(styles['menuTrigger'])}
          aria-label="Lists"
        >
          <LuMenu aria-hidden="true" size={20} />
        </Dialog.Trigger>
        <div className={styles['body']}>
          {isDesktop ? (
            <aside className={styles['nav']}>{navContent}</aside>
          ) : (
            <Dialog.Portal>
              {drawerOpen && (
                <Dialog.Backdrop className={cx(styles['scrim'])} />
              )}
              <Dialog.Popup
                render={<aside />}
                className={cx(styles['navOpen'])}
              >
                {navContent}
              </Dialog.Popup>
            </Dialog.Portal>
          )}
          <main className={styles['main']}>
            <h1 className={styles['title']}>
              {activeList?.displayName ?? 'Todos'}
            </h1>
            {active ? (
              <TodoPane listId={active} />
            ) : (
              <p className={styles['empty']}>Create a list to get started.</p>
            )}
          </main>
        </div>
      </div>
    </Dialog.Root>
  )
}
