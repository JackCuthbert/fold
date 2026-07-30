export function Checkbox(props: {
  checked: boolean
  label: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={props.checked}
      aria-label={props.label}
      className={props.checked ? 'check check--done' : 'check'}
      onClick={props.onToggle}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle className="check__ring" cx="12" cy="12" r="10.5" />
        <path className="check__mark" d="M7 12.5l3.5 3.5L17 9" />
      </svg>
    </button>
  )
}
