import { useState } from 'react'
import { Header } from './header'
import { ListNav, useLists } from './lists/list-nav'
import { TodoPane } from './todos/todo-pane'

export function MainScreen() {
  const lists = useLists()
  const [selected, setSelected] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const active = selected ?? lists.data?.[0]?.id ?? null
  const activeList = lists.data?.find((list) => list.id === active)

  return (
    <div className="layout">
      <Header
        title={activeList?.displayName ?? 'Todos'}
        onMenu={() => setDrawerOpen((open) => !open)}
      />
      <div className="layout__body">
        <aside
          className={
            drawerOpen ? 'layout__nav layout__nav--open' : 'layout__nav'
          }
        >
          <ListNav
            selected={active}
            onSelect={(listId) => {
              setSelected(listId)
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
