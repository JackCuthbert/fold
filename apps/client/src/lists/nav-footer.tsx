import { useIsFetching } from '@tanstack/react-query'
import { LuVolume2, LuVolumeOff } from 'react-icons/lu'
import { api, queryClient, useOnline, useSyncStatus } from '../providers'
import { useSound } from '../sound/use-sound'
import { StatusDot, type StatusKind } from '../status-dot'
import styles from './nav-footer.module.css'

// docs/specs/ui.md — status display: peripheral, not prominent. The dot
// conveys state by colour; a short label is only shown for non-synced
// states so the common case (nothing queued) stays silent.
function statusFor(
  online: boolean,
  blocked: 'offline' | 'server' | null,
  pending: number,
  fetching: number,
): { kind: StatusKind; label?: string } {
  if (!online) {
    return {
      kind: 'offline',
      label: `Offline${pending > 0 ? ` · ${pending} queued` : ''}`,
    }
  }
  if (blocked === 'server') {
    return {
      kind: 'server',
      label: `Server unreachable${pending > 0 ? ` · ${pending} queued` : ''}`,
    }
  }
  if (pending > 0) {
    return {
      kind: 'syncing',
      label: `Syncing ${pending} change${pending === 1 ? '' : 's'}`,
    }
  }
  if (fetching > 0) {
    return { kind: 'syncing', label: 'Refreshing' }
  }
  return { kind: 'synced' }
}

// docs/specs/ui.md — layout: no top bar. Configuration (sign out, sound
// toggle, sync status) lives at the bottom of the left nav instead.
export function NavFooter() {
  const online = useOnline()
  const { pending, blocked } = useSyncStatus()
  const fetching = useIsFetching()
  const { muted, toggleMuted } = useSound()
  const status = statusFor(online, blocked, pending, fetching)

  return (
    <div className={styles['footer']}>
      <div className={styles['status']}>
        <StatusDot {...status} />
      </div>
      <button
        type="button"
        className={styles['iconButton']}
        aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
        onClick={toggleMuted}
      >
        {muted ? (
          <LuVolumeOff aria-hidden="true" size={16} />
        ) : (
          <LuVolume2 aria-hidden="true" size={16} />
        )}
      </button>
      <button
        type="button"
        className={styles['signOut']}
        onClick={() => {
          // Outbox is preserved; it replays after the next sign-in
          // (docs/specs/authentication.md).
          void api.logout().catch(() => {})
          queryClient.setQueryData(['session'], null)
        }}
      >
        Sign out
      </button>
    </div>
  )
}
