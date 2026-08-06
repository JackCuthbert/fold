import { LuCircleHelp, LuSettings } from 'react-icons/lu'
import { useOnline, useSyncStatus } from '../../providers'
import { StatusDot, type StatusKind } from '../../ui/status-dot/status-dot'
import styles from './nav-footer.module.css'

// docs/specs/ui.md — status display: the dot plus its short label carry
// server reachability (Synced / Syncing… / Offline / Disconnected); a
// degraded state the user must act on or wait through (offline, queued
// work) still gets its full untruncated message from the separate fixed
// StatusPill, not here.
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

// docs/specs/ui.md — layout: no top bar. The footer at the bottom of the
// left nav keeps only the status dot and two quiet icon buttons — help and
// Settings (sound and sign out); it is not itself a rack of controls.
// docs/specs/ui.md — the nav: Settings is a ghost icon button inline with
// the sync status, not a full-width bordered row above it — that read as a
// heavier action than it is. Both now sit on one quiet row instead of two
// stacked ones. *(changed 2026-08-01.)*
// *(changed 2026-08-03: help joins Settings on the same row — a `?` opening
// the summary of what the app does, including how colours and ordering rely
// on server extensions. Both share `.control`'s ghost treatment.)*
//
// Neither modal is rendered here. On mobile this footer lives inside the nav
// drawer's Dialog, and Base UI never renders a nested dialog's backdrop (by
// design) — so a modal opened from here lost its scrim and its
// click-outside-to-close. MainScreen owns both modals and renders them as
// siblings of the drawer; this component only reports that a button was
// pressed. *(fixed 2026-08-01.)*
interface NavFooterProps {
  onOpenHelp: () => void
  onOpenSettings: () => void
}

export function NavFooter(props: NavFooterProps) {
  const online = useOnline()
  const { pending, blocked } = useSyncStatus()
  const kind = statusFor(online, blocked, pending)

  return (
    <div className={styles['footer']}>
      <div className={styles['status']}>
        <StatusDot kind={kind} />
      </div>
      <div className={styles['controls']}>
        <button
          type="button"
          className={styles['control']}
          aria-label="Help"
          onClick={props.onOpenHelp}
        >
          <LuCircleHelp aria-hidden="true" size={16} />
        </button>
        <button
          type="button"
          className={styles['control']}
          aria-label="Settings"
          onClick={props.onOpenSettings}
        >
          <LuSettings aria-hidden="true" size={16} />
        </button>
      </div>
    </div>
  )
}
