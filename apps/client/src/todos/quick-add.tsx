import { useState } from 'react'
import styles from './quick-add.module.css'

// Enter adds and keeps focus for rapid entry — docs/specs/todos.md.
export function QuickAdd(props: { onAdd: (summary: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <form
      className={styles['form']}
      onSubmit={(event) => {
        event.preventDefault()
        const summary = value.trim()
        if (summary === '') return
        props.onAdd(summary)
        setValue('')
      }}
    >
      <input
        value={value}
        placeholder="Add a todo…"
        aria-label="Add a todo"
        enterKeyHint="done"
        onChange={(event) => setValue(event.target.value)}
      />
    </form>
  )
}
