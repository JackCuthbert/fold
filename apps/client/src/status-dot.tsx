import styles from './status-dot.module.css'

export type StatusKind = 'synced' | 'syncing' | 'offline' | 'server'

/**
 * Peripheral sync indicator — a quiet dot, not a banner
 * (docs/specs/ui.md — status display). Healthy is silent (no text, no
 * chrome); a degraded state is announced separately by the fixed
 * StatusPill, which carries the full message. The dot itself only ever
 * conveys state by colour.
 */
export function StatusDot(props: { kind: StatusKind }) {
  const dotClass =
    props.kind === 'synced'
      ? styles['dot']
      : `${styles['dot']} ${styles[`dot--${props.kind === 'server' ? 'offline' : props.kind}`]}`

  return (
    <span
      className={styles['wrapper']}
      role="status"
      aria-label={props.kind === 'synced' ? 'Synced' : undefined}
    >
      <span className={dotClass} aria-hidden="true" />
    </span>
  )
}
