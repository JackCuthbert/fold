import { Dialog } from '@base-ui/react/dialog'
import { ModalHeader } from '../ui/modal-header'
import { cx } from '../styles/cx'
import { ListForm, type ListFormValues } from './list-form'
import styles from './list-form-modal.module.css'

// docs/specs/ui.md — the nav: creating a list opens a modal, like every
// other create/edit surface, not an inline form that changes the nav's
// shape while open. Editing (triggered from the per-list kebab menu) reuses
// this same shell — Dialog handles focus trapping, scroll locking,
// Escape-to-close and focus restoration to the trigger either way.
export function ListFormModal(props: {
  open: boolean
  title: string
  // The form's own inferred type, not a second hand-written copy of it —
  // the schema is the single source of truth (CLAUDE.md; docs/specs/overview.md
  // — validation).
  initial?: ListFormValues
  submitLabel: string
  onOpenChange: (open: boolean) => void
  onSubmit: (values: ListFormValues) => void
}) {
  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={cx(styles['backdrop'])} />
        <Dialog.Popup className={cx(styles['popup'])}>
          <ModalHeader>{props.title}</ModalHeader>
          {/* Keyed by the target's current values rather than `open`, so
              reopening this same dialog (e.g. Escape then Edit again on
              the same list) never resets mid close-animation — it only
              remounts when a genuinely different value needs to load,
              such as editing a different list. A string, not the object:
              `initial` is built inline by the caller, so a new identity
              arrives every render and an object key would remount on each
              one. The `\n` separator can't occur in a list name (a
              single input) or in a `#RRGGBB` colour, so two different
              pairs can never collide into one key. */}
          <ListForm
            key={`${props.initial?.displayName ?? ''}\n${
              props.initial?.color ?? ''
            }`}
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
