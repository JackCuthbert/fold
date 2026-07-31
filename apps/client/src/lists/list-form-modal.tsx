import { Dialog } from '@base-ui/react/dialog'
import { cx } from '../styles/cx'
import { ListNameForm } from './list-form'
import styles from './list-form-modal.module.css'

// docs/specs/ui.md — the nav: creating a list opens a modal, like every
// other create/edit surface, not an inline form that changes the nav's
// shape while open. Rename (triggered from the per-list kebab menu) reuses
// this same shell — Dialog handles focus trapping, scroll locking,
// Escape-to-close and focus restoration to the trigger either way.
export function ListFormModal(props: {
  open: boolean
  title: string
  initial?: string
  submitLabel: string
  onOpenChange: (open: boolean) => void
  onSubmit: (displayName: string) => void
}) {
  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={cx(styles['backdrop'])} />
        <Dialog.Popup className={cx(styles['popup'])}>
          <Dialog.Title className={cx(styles['title'])}>
            {props.title}
          </Dialog.Title>
          {/* Keyed by the target's current name rather than `open`, so
              reopening this same dialog (e.g. Escape then Rename again on
              the same list) never resets mid close-animation — it only
              remounts when a genuinely different value needs to load,
              such as renaming a different list. */}
          <ListNameForm
            key={props.initial ?? ''}
            {...(props.initial !== undefined ? { initial: props.initial } : {})}
            submitLabel={props.submitLabel}
            onCancel={() => props.onOpenChange(false)}
            onSubmit={props.onSubmit}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
