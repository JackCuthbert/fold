import { Form } from '@base-ui/react/form'
import { Input } from '@base-ui/react/input'
import { useState } from 'react'
import styles from './quick-add.module.css'

// Enter adds and keeps focus for rapid entry — docs/specs/todos.md.
// docs/specs/ui.md — Base UI's Form/Input supply the accessible submit
// wiring rather than a hand-rolled <form>/<input> pair.
export function QuickAdd(props: { onAdd: (summary: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <Form
      className={styles['form']}
      onSubmit={(event) => {
        event.preventDefault()
        const summary = value.trim()
        if (summary === '') return
        props.onAdd(summary)
        setValue('')
      }}
    >
      <Input
        value={value}
        placeholder="Add a todo…"
        aria-label="Add a todo"
        enterKeyHint="done"
        onValueChange={setValue}
      />
    </Form>
  )
}
