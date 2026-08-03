import { Dialog } from '@base-ui/react/dialog'
import type { ReactNode } from 'react'
import { cx } from './styles/cx'
import styles from './confirm.module.css'

// Base UI's Dialog handles focus trapping, scroll locking, Escape-to-close
// and focus restoration to the trigger — docs/specs/ui.md: prefer it over
// hand-rolling focus management (previously a native <dialog> driven
// imperatively by showModal()/close()).
//
// Deliberately NOT using ModalHeader: this is the one dialog with no ✕
// (docs/specs/ui.md — overlays: closing a modal). A destructive confirm
// asks a question and offers two answers; a third dismissal path in the
// header would compete with the explicit Cancel beside the destructive
// action. Escape and a click outside remain, as on every dialog.
// *(decided 2026-08-03, issue #14.)*
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
            <button
              type="button"
              className={styles['cancel']}
              onClick={props.onCancel}
            >
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
