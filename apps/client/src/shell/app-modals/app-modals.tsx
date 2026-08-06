import { ConfirmDialog } from '../../ui'
import { HelpModal } from '../../help/help-modal/help-modal'
import { ListFormModal } from '../../lists/list-form-modal/list-form-modal'
import { RevealListsDialog } from '../../lists/list-filter-menu/list-filter-menu'
import { SettingsModal } from '../../lists/settings-modal/settings-modal'
import { AddTodoModal } from '../../todos/add-todo-modal/add-todo-modal'
import { useListFilter } from '../context/list-filter-context'
import { useOverlays } from '../context/overlays-context'
import { useSelection } from '../context/selection-context'

/**
 * Every modal in the app, rendered as siblings at the top level.
 *
 * They are collected here because they are here for **one reason**, and it
 * is worth stating once in a file named for it rather than repeating at
 * each site: Base UI does not render a nested dialog's backdrop, by design.
 *
 * On mobile the nav is itself a `Dialog`, and the buttons that open most of
 * these live inside it — the footer's Settings and Help, the nav's list
 * actions, the filter's reveal confirmation. A modal owned where its button
 * lives would therefore be *nested*, and would silently lose its scrim and
 * its click-outside-to-close. Two of them shipped that way and had to be
 * fixed (Settings 2026-08-01, the list forms 2026-08-04, issues #20/#21).
 *
 * The list forms have a second reason on top: `ListNav` is rendered by two
 * different trees either side of the 768px breakpoint, so a modal owned
 * there also *unmounted* on a resize, losing a half-typed list.
 *
 * So: these render as siblings of the drawer, never inside it, and the
 * components that trigger them only report that a button was pressed.
 * *(collected here 2026-08-06, issue #28.)*
 */
export function AppModals() {
  const overlays = useOverlays()
  const filter = useListFilter()
  const selection = useSelection()
  const { listForm, globalAdd } = overlays
  // The list the add-todo modal defaults to, when you are looking at one.
  const activeList = filter.allLists.find(
    (list) => list.id === selection.active,
  )
  return (
    <>
      {/* Siblings of `drawer`, never inside it — see `overlays.settingsOpen` above. */}
      <SettingsModal
        open={overlays.settingsOpen}
        onOpenChange={overlays.setSettingsOpen}
      />
      <HelpModal open={overlays.helpOpen} onOpenChange={overlays.setHelpOpen} />
      {/* docs/specs/list-filter.md — asking before every hidden list
          reappears. A sibling of the drawer for the same reason Settings
          is: it is opened from inside the nav, which is a Dialog on
          mobile. */}
      <RevealListsDialog
        open={overlays.revealing}
        count={filter.hiddenCount}
        onCancel={() => overlays.setRevealing(false)}
        onConfirm={() => {
          overlays.setRevealing(false)
          filter.clear()
        }}
      />
      {/* The global add-todo modal (issue #15), opened by the sidebar
          button or Cmd/Ctrl+K. A sibling of the drawer for the same reason
          Settings and Help are: on mobile the button lives inside the
          drawer's Dialog, and a modal owned there would be nested and lose
          its backdrop.

          Passing `lists` is what turns on the picker (issue #15).

          It defaults to the list you are looking at, and only demands a
          choice when there isn't one — on Today or Summary, which are not
          lists. The original rule was "never default", on the grounds
          that filing a todo into a list you never looked at is worse than
          asking; that reasoning is about the derived views and does not
          survive contact with the case where you are *in* a list and
          press the same shortcut. There, the list on screen is obviously
          the answer, and re-picking it every time is friction.
          *(changed 2026-08-05.)* */}
      <AddTodoModal
        open={globalAdd.open}
        onOpenChange={globalAdd.setOpen}
        target={{
          kind: 'global',
          lists: filter.allLists,
          ...(activeList ? { defaultListId: activeList.id } : {}),
          onAdd: (listId, todo) => {
            globalAdd.add(listId, todo)
            // Go to where the todo landed. Creating something and being
            // left looking at a view that may not contain it reads as a
            // failure.
            selection.select(listId)
          },
        }}
        triggerRef={overlays.globalAddTriggerRef}
      />
      {/* The list surfaces, here for the same reason and for one more —
          see `listForm` above (issues #20 and #21). Opening one closes the
          drawer: on mobile it's an overlay in its own right, and leaving it
          open behind the modal would stack two scrims and two focus traps,
          exactly as Settings does. */}
      <ListFormModal
        open={listForm.creating}
        title="New list"
        submitLabel="Create"
        onOpenChange={listForm.setCreating}
        onSubmit={(values) => {
          selection.select(listForm.submitCreate(values))
          overlays.setDrawerOpen(false)
        }}
      />
      <ListFormModal
        open={listForm.editing !== null}
        title="Edit list"
        {...(listForm.editing
          ? {
              initial: {
                displayName: listForm.editing.displayName,
                ...(listForm.editing.color !== undefined
                  ? { color: listForm.editing.color }
                  : {}),
              },
            }
          : {})}
        submitLabel="Save"
        onOpenChange={(open) => {
          if (!open) listForm.closeEdit()
        }}
        onSubmit={(values) => {
          listForm.submitEdit(values)
          overlays.setDrawerOpen(false)
        }}
      />
      <ConfirmDialog
        open={listForm.deleting !== null}
        title={`Delete "${listForm.deleting?.displayName ?? ''}"?`}
        confirmLabel="Delete list"
        onCancel={listForm.closeDelete}
        onConfirm={() => {
          listForm.confirmDelete()
          overlays.setDrawerOpen(false)
        }}
      >
        <p>This deletes the list and all its todos from the server.</p>
      </ConfirmDialog>
    </>
  )
}
