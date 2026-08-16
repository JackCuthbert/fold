import {
  createContext,
  use,
  useCallback,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import styles from './toast.module.css'

interface ToastEntry {
  id: number
  message: string
}

const ToastContext = createContext<(message: string) => void>(() => {})

export const useToast = () => use(ToastContext)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const nextId = useRef(0)

  const push = useCallback((message: string) => {
    const id = nextId.current++
    setToasts((current) => [...current, { id, message }])
    setTimeout(() => {
      setToasts((current) => current.filter((entry) => entry.id !== id))
    }, 5000)
  }, [])

  return (
    <ToastContext value={push}>
      {children}
      <div className={styles['toasts']} role="status" aria-live="polite">
        {toasts.map((entry) => (
          <div key={entry.id} className={styles['toast']}>
            {entry.message}
          </div>
        ))}
      </div>
    </ToastContext>
  )
}
