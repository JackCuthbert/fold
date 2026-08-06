import type { TodoList } from '@fold/schemas'
import type { RefObject } from 'react'
import { LuOrigami } from 'react-icons/lu'
import type { ListFilter } from '../lists/list-filter'
import { ListFilterMenu } from '../lists/list-filter-menu'
import { ListNav } from '../lists/list-nav'
import { NavFooter } from '../lists/nav-footer'
import type { ListFormState } from '../lists/use-list-form'
import styles from './main-screen.module.css'

/**
 * The contents of the nav panel: the app mark, the list of lists, the
 * footer.
 *
 * Rendered twice — inside the drawer's `Dialog.Popup` on mobile, and
 * inside the pinned `<aside>` on desktop — which is why it is a component
 * rather than markup at one site.
 *
 * docs/specs/ui.md — the nav has a title above its list of lists, so the
 * panel is labelled rather than starting abruptly; `.navTitle`'s
 * border-bottom is the divider that separates a title from its content in
 * modals and side panels (docs/specs/ui.md — overlays).
 *
 * docs/specs/ui.md — scrolling: inside the nav, the list of lists scrolls
 * while the title and the footer stay anchored. `.navScroll` is the only
 * child that overflows.
 */
export function NavPanel(props: {
  lists: TodoList[]
  activeView: string
  filter: ListFilter
  listForm: ListFormState
  newTodoRef: RefObject<HTMLButtonElement | null>
  onToggleList: (listId: string) => void
  onClearFilter: () => void
  onRevealLists: () => void
  onNewTodo: () => void
  onSelect: (listId: string) => void
  onOpenHelp: () => void
  onOpenSettings: () => void
}) {
  return (
    <>
      {/* docs/specs/ui.md — the nav is headed by the app's own mark rather
          than a section label: with Today, Summary and the lists all below
          it, "Lists" only described part of what follows. Origami for the
          folded paper the name means. *(changed 2026-08-02.)* */}
      <h2 className={styles['navTitle']}>
        <LuOrigami aria-hidden="true" size={18} />
        Fold
        {/* docs/specs/list-filter.md — the list filter, as a ghost icon
            button at the trailing edge of the title row. It costs no
            vertical space, and the row was empty to the right of the
            mark; every full-width shape tried before gave a
            twice-a-day control the presence of a primary action.

            Here rather than inside ListNav because it owns a
            ConfirmDialog: on mobile ListNav renders inside the drawer's
            Dialog, where a nested dialog gets no backdrop of its own —
            the same trap Settings and the list forms are hoisted out of.
            *(moved 2026-08-05.)* */}
        <ListFilterMenu
          lists={props.lists}
          filter={props.filter}
          onToggle={props.onToggleList}
          onClear={props.onClearFilter}
        />
      </h2>
      <div className={styles['navScroll']}>
        <ListNav
          selected={props.activeView}
          form={props.listForm}
          newTodoRef={props.newTodoRef}
          filter={props.filter}
          onRevealLists={props.onRevealLists}
          onNewTodo={props.onNewTodo}
          onSelect={props.onSelect}
        />
      </div>
      <NavFooter
        onOpenHelp={props.onOpenHelp}
        onOpenSettings={props.onOpenSettings}
      />
    </>
  )
}
