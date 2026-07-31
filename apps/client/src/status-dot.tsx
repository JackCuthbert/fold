import styles from './status-dot.module.css'

export type StatusKind = 'synced' | 'syncing' | 'offline' | 'server'

/**
 * Peripheral sync indicator — a quiet dot, not a banner
 * (docs/specs/ui.md — status display). The dot conveys state by colour;
 * a short label only appears for non-synced states, keeping the common
 * case (synced, nothing queued) silent and unobtrusive. The label text is
 * also what assistive tech and the e2e suite key off (e.g. "Offline · N
 * queued", "Server unreachable", "Syncing N changes").
 */
export function StatusDot(props: { kind: StatusKind; label?: string }) {
  const dotClass =
    props.kind === 'synced'
      ? styles['dot']
      : `${styles['dot']} ${styles[`dot--${props.kind === 'server' ? 'offline' : props.kind}`]}`

  return (
    <span
      className={styles['wrapper']}
      role="status"
      aria-label={props.label ? undefined : 'Synced'}
    >
      <span className={dotClass} aria-hidden="true" />
      {props.label && <span className={styles['label']}>{props.label}</span>}
    </span>
  )
}
