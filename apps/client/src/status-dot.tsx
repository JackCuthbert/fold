import { cx } from './styles/cx'
import styles from './status-dot.module.css'

export type StatusKind = 'synced' | 'syncing' | 'offline' | 'server'

// docs/specs/ui.md — status display (revised 2026-07-31): the dot carries
// server reachability, not the pill. Healthy is muted and static; anything
// else the server itself is responsible for ('server' — unreachable or
// erroring) turns the dot red and gently pulsing. Offline/syncing (network
// or queue state, not server health) keep the original muted/accent
// treatment — only the *server* dimension gets the alarming colour, so a
// blip doesn't repaint the dot for reasons unrelated to reachability.
const LABEL: Record<StatusKind, string> = {
  synced: 'Synced',
  syncing: 'Syncing',
  offline: 'Offline',
  server: 'Server unreachable',
}

/**
 * Peripheral sync indicator — a quiet dot, not a banner
 * (docs/specs/ui.md — status display). Healthy is silent chrome-wise; a
 * degraded state that the user must act on or wait through is announced
 * separately by the fixed StatusPill, which carries the full message. The
 * dot never conveys state by colour alone — an accessible label always
 * names the current state for assistive tech, even though it's visually
 * silent when healthy.
 */
export function StatusDot(props: { kind: StatusKind }) {
  return (
    <span className={styles['wrapper']} role="status">
      <span
        className={cx(
          styles['dot'],
          props.kind !== 'synced' && styles[`dot--${props.kind}`],
        )}
        aria-hidden="true"
      />
      <span className="sr-only">{LABEL[props.kind]}</span>
    </span>
  )
}
