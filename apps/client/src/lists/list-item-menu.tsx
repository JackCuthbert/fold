import { Menu } from '@base-ui/react/menu'
import { LuArrowDown, LuArrowUp, LuPencil, LuTrash2 } from 'react-icons/lu'
import { cx } from '../styles/cx'
import styles from './list-item-menu.module.css'

// docs/specs/ui.md — the nav: per-list actions live in a kebab menu at the
// row's right edge, rather than inline icon buttons squeezing the row's
// name. Base UI's Menu supplies the keyboard and focus behaviour
// (open/close, arrow-key navigation, typeahead, Escape, focus restoration
// to the trigger) rather than hand-rolling it.
export function ListItemMenu(props: {
  displayName: string
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        className={cx(styles['trigger'])}
        aria-label={`Actions for ${props.displayName}`}
      >
        <span aria-hidden="true">⋮</span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          className={cx(styles['positioner'])}
          side="bottom"
          align="end"
          sideOffset={4}
        >
          <Menu.Popup className={cx(styles['popup'])}>
            {/* docs/specs/lists.md — ordering: buttons rather than
                drag-and-drop. Reordering lists is rare, and buttons are
                keyboard-operable for free, work on touch without a
                long-press gesture, and are testable without flake.
                Disabled at either end, where there is no neighbour to
                swap with. */}
            <Menu.Item
              className={cx(styles['item'])}
              disabled={!props.canMoveUp}
              onClick={props.onMoveUp}
            >
              <LuArrowUp aria-hidden="true" size={14} />
              Move up
            </Menu.Item>
            <Menu.Item
              className={cx(styles['item'])}
              disabled={!props.canMoveDown}
              onClick={props.onMoveDown}
            >
              <LuArrowDown aria-hidden="true" size={14} />
              Move down
            </Menu.Item>
            {/* "Edit", not "Rename": this opens a dialog titled "Edit list"
                that changes the name *and* the colour, so the narrower word
                undersold it. *(changed 2026-08-03.)* */}
            <Menu.Item className={cx(styles['item'])} onClick={props.onEdit}>
              <LuPencil aria-hidden="true" size={14} />
              Edit
            </Menu.Item>
            <Menu.Item
              className={cx(styles['item'], styles['destructive'])}
              onClick={props.onDelete}
            >
              <LuTrash2 aria-hidden="true" size={14} />
              Delete
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
