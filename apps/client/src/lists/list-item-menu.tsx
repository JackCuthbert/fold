import { Menu } from '@base-ui/react/menu'
import { LuPencil, LuTrash2 } from 'react-icons/lu'
import { cx } from '../styles/cx'
import styles from './list-item-menu.module.css'

// docs/specs/ui.md — the nav: per-list actions live in a kebab menu at the
// row's right edge, holding Rename and Delete, rather than two inline icon
// buttons squeezing the row's name. Base UI's Menu supplies the keyboard
// and focus behaviour (open/close, arrow-key navigation, typeahead,
// Escape, focus restoration to the trigger) rather than hand-rolling it.
export function ListItemMenu(props: {
  displayName: string
  onRename: () => void
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
            <Menu.Item className={cx(styles['item'])} onClick={props.onRename}>
              <LuPencil aria-hidden="true" size={14} />
              Rename
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
