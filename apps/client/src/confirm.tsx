import { useRef, type ReactNode } from 'react'

export function ConfirmDialog(props: {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  if (props.open && ref.current && !ref.current.open) ref.current.showModal()
  if (!props.open && ref.current?.open) ref.current.close()
  return (
    <dialog ref={ref} className="confirm" onCancel={props.onCancel}>
      <h2>{props.title}</h2>
      <div>{props.children}</div>
      <div className="confirm__actions">
        <button type="button" onClick={props.onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="confirm__danger"
          onClick={props.onConfirm}
        >
          {props.confirmLabel}
        </button>
      </div>
    </dialog>
  )
}
