import { useOnline, useSyncStatus } from '../providers'
import styles from './status-pill.module.css'

/**
 * docs/specs/ui.md — status display (revised 2026-07-31): server
 * reachability now lives on the nav footer's StatusDot (colour + accessible
 * label), not here. The pill is reserved for states the user must act on
 * or wait through — offline, queued work blocked on sign-in, or syncing —
 * shown as a fixed, persistent pill at the bottom of the viewport, centred,
 * above the content, full untruncated message plus queued count, announced
 * to assistive tech, and never blocking interaction. It disappears by
 * itself once the condition resolves; it is a state indicator, not an
 * auto-dismissing toast (that's ToastProvider, kept separate).
 *
 * A brief upstream failure while work is queued turns the dot red but
 * leaves this pill saying "Syncing N changes" — which stays true, since
 * the outbox retries regardless. With nothing queued, a transient server
 * blip shows on the dot alone; a sentence of text isn't worth it for a
 * blip the sync layer is already handling.
 */
function messageFor(
  online: boolean,
  blocked: 'offline' | 'server' | 'auth' | null,
  pending: number,
): string | null {
  if (!online) {
    return `Offline${pending > 0 ? ` · ${pending} queued` : ''}`
  }
  if (blocked === 'auth') {
    // Queued work can't progress while signed out — don't claim it's syncing.
    return `Sign in to save ${pending} change${pending === 1 ? '' : 's'}`
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
