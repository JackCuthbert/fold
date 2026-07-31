import { useEffect, useRef, useState } from 'react'
import { Header } from './header'
import { ListNav, useLists } from './lists/list-nav'
import { TodoPane } from './todos/todo-pane'

const SELECTED_LIST_KEY = 'caldav-todo:selected-list'

export function MainScreen() {
  const lists = useLists()
  const [selected, setSelected] = useState<string | null>(() =>
    localStorage.getItem(SELECTED_LIST_KEY),
  )
  const [drawerOpen, setDrawerOpen] = useState(false)
  const drawerRef = useRef<HTMLElement>(null)
  const menuRef = useRef<HTMLButtonElement>(null)

  // The persisted list may no longer exist (deleted elsewhere); fall back
  // to the first available list rather than showing nothing.
  const selectedExists =
    selected !== null &&
    (lists.data?.some((list) => list.id === selected) ?? true)
  const active =
    (selectedExists ? selected : null) ?? lists.data?.[0]?.id ?? null
  const activeList = lists.data?.find((list) => list.id === active)

  const selectList = (listId: string): void => {
    setSelected(listId)
    localStorage.setItem(SELECTED_LIST_KEY, listId)
  }

  const closeDrawer = (): void => {
    setDrawerOpen(false)
    // Return focus to the control that opened it.
    menuRef.current?.focus()
  }

  // Escape closes the drawer, matching the native <dialog> behaviour used
  // by ConfirmDialog.
  useEffect(() => {
    if (!drawerOpen) return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeDrawer()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [drawerOpen])

  // Move focus into the drawer when it opens so keyboard and screen-reader
  // users land inside it rather than behind it.
  useEffect(() => {
    if (drawerOpen) drawerRef.current?.focus()
  }, [drawerOpen])

  return (
    <div className="layout">
      <Header
        ref={menuRef}
        title={activeList?.displayName ?? 'Todos'}
        onMenu={() => setDrawerOpen((open) => !open)}
      />
      <div className="layout__body">
        {drawerOpen && (
          <button
            type="button"
            className="layout__scrim"
            aria-label="Close lists"
            onClick={closeDrawer}
          />
        )}
        <aside
          ref={drawerRef}
          tabIndex={-1}
          className={
            drawerOpen ? 'layout__nav layout__nav--open' : 'layout__nav'
          }
        >
          <ListNav
            selected={active}
            onSelect={(listId) => {
              selectList(listId)
              setDrawerOpen(false)
            }}
          />
        </aside>
        <main className="layout__main">
          {active ? (
            <TodoPane listId={active} />
          ) : (
            <p className="empty">Create a list to get started.</p>
          )}
        </main>
      </div>
    </div>
  )
}
