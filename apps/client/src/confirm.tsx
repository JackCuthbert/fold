import { useRef, type ReactNode } from 'react'
import styles from './confirm.module.css'

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
    <dialog ref={ref} className={styles['confirm']} onCancel={props.onCancel}>
      <h2 className={styles['title']}>{props.title}</h2>
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
    </dialog>
  )
}
