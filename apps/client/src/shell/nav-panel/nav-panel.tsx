import { LuOrigami } from 'react-icons/lu'
import { ListFilterMenu } from '../../lists/list-filter-menu/list-filter-menu'
import { ListNav } from '../../lists/list-nav/list-nav'
import { NavFooter } from '../../lists/nav-footer/nav-footer'
import { useListFilter } from '../context/list-filter-context'
import { useOverlays } from '../context/overlays-context'
import { useSelection } from '../context/selection-context'
import styles from '../main-screen/main-screen.module.css'

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
export function NavPanel() {
  const overlays = useOverlays()
  const filter = useListFilter()
  const selection = useSelection()
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
          lists={filter.allLists}
          filter={filter.filter}
          onToggle={filter.toggle}
          onClear={filter.clear}
        />
      </h2>
      <div className={styles['navScroll']}>
        <ListNav
          selected={selection.active}
          form={overlays.listForm}
          newTodoRef={overlays.globalAddTriggerRef}
          filter={filter.filter}
          onRevealLists={() => overlays.setRevealing(true)}
          onNewTodo={() => overlays.globalAdd.setOpen(true)}
          onSelect={(listId) =>
            overlays.openOverDrawer(() => selection.select(listId))
          }
        />
      </div>
      {/* docs/specs/ui.md — overlays: a modal opened from inside another
          overlay stacks *above* it and leaves it open. Both of these used
          to close the drawer first, which was inconsistent with Edit list
          (opened from the same drawer, and it stacks) — and it meant
          dismissing Settings dropped you on the bare list rather than back
          in the nav where you were. *(changed 2026-08-09.)* */}
      <NavFooter
        onOpenHelp={() => overlays.setHelpOpen(true)}
        onOpenSettings={() => overlays.setSettingsOpen(true)}
      />
    </>
  )
}
