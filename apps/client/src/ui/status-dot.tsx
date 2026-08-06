import { cx } from '../styles/cx'
import styles from './status-dot.module.css'

export type StatusKind = 'synced' | 'syncing' | 'offline' | 'server'

// docs/specs/ui.md — status display (revised again 2026-07-31): now that
// the underlying flapping is fixed, the footer carries a short label next
// to the dot, not just colour. Three visual states map onto the four
// StatusKinds: healthy (green, static), working — syncing/queued (amber,
// static), and disconnected — offline *or* server-unreachable (red, gently
// pulsing). 'offline' and 'server' share the same colour/motion treatment
// since both mean "can't reach the server right now"; only the label text
// tells them apart ("Offline" vs "Disconnected"), matching the distinct
// cause a user might want named.
const LABEL: Record<StatusKind, string> = {
  synced: 'Synced',
  syncing: 'Syncing…',
  offline: 'Offline',
  server: 'Disconnected',
}

/**
 * Peripheral sync indicator — a quiet dot plus a short label, not a banner
 * (docs/specs/ui.md — status display). A degraded state the user must act
 * on or wait through is announced separately by the fixed StatusPill, which
 * carries the full message; this stays short. State is never conveyed by
 * colour alone — the label is real visible text, not just an sr-only
 * accessible name.
 */
export function StatusDot(props: { kind: StatusKind }) {
  const disconnected = props.kind === 'offline' || props.kind === 'server'
  return (
    <span className={styles['wrapper']} role="status">
      <span
        className={cx(
          styles['dot'],
          props.kind === 'syncing' && styles['dot--syncing'],
          disconnected && styles['dot--offline'],
        )}
        aria-hidden="true"
      />
      <span className={styles['label']}>{LABEL[props.kind]}</span>
    </span>
  )
}
