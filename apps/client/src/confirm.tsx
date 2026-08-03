import { AlertDialog } from '@base-ui/react/alert-dialog'
import type { ReactNode } from 'react'
import { cx } from './styles/cx'
import styles from './confirm.module.css'

// Base UI's AlertDialog handles focus trapping, scroll locking,
// Escape-to-close and focus restoration to the trigger — docs/specs/ui.md:
// prefer it over hand-rolling focus management.
//
// AlertDialog rather than Dialog: this interrupts to ask about something
// irreversible, which is exactly what `role="alertdialog"` means — screen
// readers announce it assertively rather than as an ordinary dialog. It
// also declines to close on an outside click, so a stray click next to a
// destructive question cannot dismiss it. Escape still cancels.
// *(changed 2026-08-04, issue #19.)*
//
// Deliberately NOT using ModalHeader: this is the one dialog with no ✕
// (docs/specs/ui.md — overlays: closing a modal). A destructive confirm
// asks a question and offers two answers; a third dismissal path in the
// header would compete with the explicit Cancel beside the destructive
// action.
export function ConfirmDialog(props: {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <AlertDialog.Root
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onCancel()
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={cx(styles['backdrop'])} />
        <AlertDialog.Popup className={cx(styles['confirm'])}>
          <AlertDialog.Title className={cx(styles['title'])}>
            {props.title}
          </AlertDialog.Title>
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
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
