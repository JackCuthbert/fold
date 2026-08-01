import { useState } from 'react'
import { LuSettings } from 'react-icons/lu'
import { useOnline, useSyncStatus } from '../providers'
import { StatusDot, type StatusKind } from '../status-dot'
import styles from './nav-footer.module.css'
import { SettingsModal } from './settings-modal'

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
// left nav keeps only a single "Settings" entry (opening the settings
// modal — sound and sign out) and the status dot; it is not itself a rack
// of controls.
// docs/specs/ui.md — the nav: Settings is a ghost icon button inline with
// the sync status, not a full-width bordered row above it — that read as a
// heavier action than it is. Both now sit on one quiet row instead of two
// stacked ones. *(changed 2026-08-01.)*
export function NavFooter() {
  const online = useOnline()
  const { pending, blocked } = useSyncStatus()
  const kind = statusFor(online, blocked, pending)
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div className={styles['footer']}>
      <div className={styles['status']}>
        <StatusDot kind={kind} />
      </div>
      <button
        type="button"
        className={styles['settings']}
        aria-label="Settings"
        onClick={() => setSettingsOpen(true)}
      >
        <LuSettings aria-hidden="true" size={16} />
      </button>
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}
