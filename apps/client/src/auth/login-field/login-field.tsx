import type { Credentials } from '@fold/schemas'
import { Field } from '@base-ui/react/field'
import { Input } from '@base-ui/react/input'
import { Controller, type Control } from 'react-hook-form'
import styles from './login-field.module.css'

interface LoginFieldProps {
  control: Control<Credentials>
  name: keyof Credentials
  /** The visible label, and the accessible name the e2e helper types by. */
  label: string
  type?: 'url' | 'text' | 'password'
  autoComplete: string
  placeholder?: string
  /** Shown when zod reports a problem it has no message for. */
  fallbackError: string
}

/**
 * One labelled field of the login form — docs/specs/authentication.md.
 *
 * Extracted 2026-08-10 with the split-pane redesign: the three fields were
 * ~26 lines of identical `Controller` + `Field.Root` + `Input` boilerplate
 * each, which is most of what the screen file contained and made the
 * layout hard to see for the wiring (docs/specs/ui.md — the ~300 line
 * ceiling is a prompt to ask whether a second concern has crept in).
 *
 * docs/specs/ui.md — every interactive element comes from Base UI: Field
 * and Input supply the label/ARIA/validation wiring, while react-hook-form
 * and zod stay the state and validation layer, joined by `Controller` per
 * Base UI's documented integration pattern.
 *
 * **The label text is load-bearing.** Every e2e test signs in through this
 * form by accessible name (`e2e/tests/helpers.ts` — `login`), so "Server
 * URL", "Username" and "Password" are API, not copy.
 */
export function LoginField(props: LoginFieldProps) {
  return (
    <Controller
      name={props.name}
      control={props.control}
      render={({
        field: { ref, name, value, onBlur, onChange },
        fieldState: { invalid, error },
      }) => (
        <Field.Root className={styles['field']} name={name} invalid={invalid}>
          <Field.Label className={styles['label']}>{props.label}</Field.Label>
          <Input
            ref={ref}
            {...(props.type ? { type: props.type } : {})}
            {...(props.placeholder ? { placeholder: props.placeholder } : {})}
            autoComplete={props.autoComplete}
            value={value ?? ''}
            onBlur={onBlur}
            onValueChange={onChange}
          />
          <Field.Error className={styles['error']} match={!!error}>
            {error?.message ?? props.fallbackError}
          </Field.Error>
        </Field.Root>
      )}
    />
  )
}
