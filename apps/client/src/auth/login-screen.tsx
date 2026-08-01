import { credentialsSchema, type Credentials } from '@fold/schemas'
import { zodResolver } from '@hookform/resolvers/zod'
import { Field } from '@base-ui/react/field'
import { Form } from '@base-ui/react/form'
import { Input } from '@base-ui/react/input'
import { useMutation } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { ApiError } from '../api/errors'
import { api, queryClient } from '../providers'
import styles from './login-screen.module.css'

// docs/specs/authentication.md — login form, react-hook-form + zod.
// docs/specs/ui.md — every interactive element comes from Base UI: Form,
// Field and Input supply the accessible wiring (labels, ARIA, validation
// messages); react-hook-form + zod remain the state/validation layer, wired
// together via Controller per the Base UI + react-hook-form integration
// pattern (bundled docs: react/handbook/forms.md).
// The local compose stack (docs/user/local-caldav-server.md). Dev-only:
// these credentials exist on nobody's real server, so the button must not
// appear in a production build.
const DEMO: Credentials = {
  serverUrl: 'http://localhost:5232/testuser/',
  username: 'testuser',
  password: 'testpass',
}

export function LoginScreen() {
  const {
    control,
    handleSubmit,
    setValue,
    formState: { isSubmitting },
  } = useForm<Credentials>({ resolver: zodResolver(credentialsSchema) })

  const fillDemo = (): void => {
    setValue('serverUrl', DEMO.serverUrl, { shouldValidate: true })
    setValue('username', DEMO.username, { shouldValidate: true })
    setValue('password', DEMO.password, { shouldValidate: true })
  }

  const login = useMutation({
    mutationFn: api.login,
    onSuccess: (session) => queryClient.setQueryData(['session'], session),
  })

  const submitError =
    login.error instanceof ApiError && login.error.status === 401
      ? 'The CalDAV server rejected these credentials.'
      : login.error
        ? 'Could not reach the server. Check the URL and try again.'
        : null

  return (
    <main className={styles['login']}>
      <h1 className={styles['heading']}>Fold</h1>
      <p className={styles['hint']}>Sign in to your CalDAV server</p>
      <Form
        className={styles['form']}
        onSubmit={handleSubmit((credentials) => login.mutate(credentials))}
      >
        <Controller
          name="serverUrl"
          control={control}
          render={({
            field: { ref, name, value, onBlur, onChange },
            fieldState: { invalid, error },
          }) => (
            <Field.Root
              className={styles['field']}
              name={name}
              invalid={invalid}
            >
              <Field.Label>Server URL</Field.Label>
              <Input
                ref={ref}
                type="url"
                placeholder="https://dav.example.com/username/"
                autoComplete="url"
                value={value ?? ''}
                onBlur={onBlur}
                onValueChange={onChange}
              />
              <Field.Error className={styles['error']} match={!!error}>
                {error?.message ?? 'Enter a valid URL'}
              </Field.Error>
            </Field.Root>
          )}
        />
        <Controller
          name="username"
          control={control}
          render={({
            field: { ref, name, value, onBlur, onChange },
            fieldState: { invalid, error },
          }) => (
            <Field.Root
              className={styles['field']}
              name={name}
              invalid={invalid}
            >
              <Field.Label>Username</Field.Label>
              <Input
                ref={ref}
                autoComplete="username"
                value={value ?? ''}
                onBlur={onBlur}
                onValueChange={onChange}
              />
              <Field.Error className={styles['error']} match={!!error}>
                {error?.message ?? 'Required'}
              </Field.Error>
            </Field.Root>
          )}
        />
        <Controller
          name="password"
          control={control}
          render={({
            field: { ref, name, value, onBlur, onChange },
            fieldState: { invalid, error },
          }) => (
            <Field.Root
              className={styles['field']}
              name={name}
              invalid={invalid}
            >
              <Field.Label>Password</Field.Label>
              <Input
                ref={ref}
                type="password"
                autoComplete="current-password"
                value={value ?? ''}
                onBlur={onBlur}
                onValueChange={onChange}
              />
              <Field.Error className={styles['error']} match={!!error}>
                {error?.message ?? 'Required'}
              </Field.Error>
            </Field.Root>
          )}
        />
        {submitError && (
          <p className={styles['error']} role="alert">
            {submitError}
          </p>
        )}
        <button
          type="submit"
          className={styles['submit']}
          disabled={isSubmitting || login.isPending}
        >
          Sign in
        </button>
        {import.meta.env.DEV && (
          <button type="button" className={styles['demo']} onClick={fillDemo}>
            Use demo server
          </button>
        )}
      </Form>
    </main>
  )
}
