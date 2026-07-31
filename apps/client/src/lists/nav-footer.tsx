import { Toggle } from '@base-ui/react/toggle'
import { Toolbar } from '@base-ui/react/toolbar'
import { LuVolume2, LuVolumeOff } from 'react-icons/lu'
import { api, queryClient, useOnline, useSyncStatus } from '../providers'
import { useSound } from '../sound/use-sound'
import { StatusDot, type StatusKind } from '../status-dot'
import styles from './nav-footer.module.css'

// docs/specs/ui.md — status display: healthy is a quiet dot with no text;
// a degraded state (offline, server unreachable, or work queued) is shown
// by the separate fixed StatusPill, not here — the footer stays silent in
// the common case.
function statusFor(
  online: boolean,
  blocked: 'offline' | 'server' | 'auth' | null,
  pending: number,
): StatusKind {
  if (!online) return 'offline'
  if (blocked === 'server' || blocked === 'auth') return 'server'
  if (pending > 0) return 'syncing'
  return 'synced'
}

// docs/specs/ui.md — layout: no top bar. Configuration (sign out, sound
// toggle, sync status) lives at the bottom of the left nav instead.
// The mute toggle and sign-out button are grouped controls, so they use
// Base UI's Toolbar (docs/specs/ui.md — component library) rather than
// plain buttons in a row.
export function NavFooter() {
  const online = useOnline()
  const { pending, blocked } = useSyncStatus()
  const { muted, toggleMuted } = useSound()
  const kind = statusFor(online, blocked, pending)

  return (
    <Toolbar.Root className={styles['footer']} aria-label="Status and settings">
      <div className={styles['status']}>
        <StatusDot kind={kind} />
      </div>
      <Toolbar.Button
        render={<Toggle pressed={muted} onPressedChange={toggleMuted} />}
        className={styles['iconButton']}
        aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
      >
        {muted ? (
          <LuVolumeOff aria-hidden="true" size={16} />
        ) : (
          <LuVolume2 aria-hidden="true" size={16} />
        )}
      </Toolbar.Button>
      <Toolbar.Separator className={styles['separator']} />
      <Toolbar.Button
        className={styles['signOut']}
        onClick={() => {
          // Outbox is preserved; it replays after the next sign-in
          // (docs/specs/authentication.md).
          void api.logout().catch(() => {})
          queryClient.setQueryData(['session'], null)
        }}
      >
        Sign out
      </Toolbar.Button>
    </Toolbar.Root>
  )
}
