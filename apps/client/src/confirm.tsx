import { Dialog } from '@base-ui-components/react/dialog'
import type { ReactNode } from 'react'
import { cx } from './styles/cx'
import styles from './confirm.module.css'

// Base UI's Dialog handles focus trapping, scroll locking, Escape-to-close
// and focus restoration to the trigger — docs/specs/ui.md: prefer it over
// hand-rolling focus management (previously a native <dialog> driven
// imperatively by showModal()/close()).
export function ConfirmDialog(props: {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog.Root
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onCancel()
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={cx(styles['backdrop'])} />
        <Dialog.Popup className={cx(styles['confirm'])}>
          <Dialog.Title className={cx(styles['title'])}>
            {props.title}
          </Dialog.Title>
          <div className={styles['body']}>{props.children}</div>
          <div className={styles['actions']}>
            <button type="button" onClick={props.onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className={styles['danger']}
              onClick={props.onConfirm}
            >
              {props.confirmLabel}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
