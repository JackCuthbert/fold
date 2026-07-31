import { Checkbox as BaseCheckbox } from '@base-ui-components/react/checkbox'
import { cx } from '../styles/cx'
import styles from './checkbox.module.css'

// docs/specs/ui.md — checkboxes are small (~20px) inside a 44px hit area.
// Base UI's Checkbox.Root supplies role="checkbox"/aria-checked and keyboard
// handling; we keep the custom SVG stroke-draw for the check mark
// (docs/specs/ui.md — micro-interactions).
export function Checkbox(props: {
  checked: boolean
  label: string
  onToggle: () => void
}) {
  return (
    <span className={styles['hitArea']}>
      <BaseCheckbox.Root
        checked={props.checked}
        aria-label={props.label}
        onCheckedChange={props.onToggle}
        className={cx(styles['box'], props.checked && styles['boxChecked'])}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle className={styles['ring']} cx="12" cy="12" r="10.5" />
          <path className={styles['mark']} d="M7 12.5l3.5 3.5L17 9" />
        </svg>
      </BaseCheckbox.Root>
    </span>
  )
}
