import { useOnline, useSyncStatus } from './providers'
import styles from './status-pill.module.css'

/**
 * docs/specs/ui.md — status display: a degraded state (offline, server
 * unreachable, or queued work) is shown as a fixed, persistent pill at the
 * bottom of the viewport — centred, above the content, full untruncated
 * message plus queued count, announced to assistive tech, and never
 * blocking interaction. It disappears by itself once the condition
 * resolves; it is a state indicator, not an auto-dismissing toast (that's
 * ToastProvider, kept separate).
 *
 * Healthy has no pill at all — the nav footer's quiet StatusDot is the only
 * indicator in that case, per the same spec section.
 */
function messageFor(
  online: boolean,
  blocked: 'offline' | 'server' | null,
  pending: number,
): string | null {
  if (!online) {
    return `Offline${pending > 0 ? ` · ${pending} queued` : ''}`
  }
  if (blocked === 'server') {
    return `Server unreachable${pending > 0 ? ` · ${pending} queued` : ''}`
  }
  if (pending > 0) {
    return `Syncing ${pending} change${pending === 1 ? '' : 's'}`
  }
  return null
}

export function StatusPill() {
  const online = useOnline()
  const { pending, blocked } = useSyncStatus()
  const message = messageFor(online, blocked, pending)

  if (!message) return null

  return (
    <div className={styles['pill']} role="status" aria-live="polite">
      {message}
    </div>
  )
}
