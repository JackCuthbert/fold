import { credentialsSchema, type Credentials } from '@caldav-todo/schemas'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { ApiError } from '../api/errors'
import { api, queryClient } from '../providers'
import styles from './login-screen.module.css'

// docs/specs/authentication.md — login form, react-hook-form + zod.
export function LoginScreen() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Credentials>({ resolver: zodResolver(credentialsSchema) })

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
      <h1 className={styles['heading']}>Todos</h1>
      <p className={styles['hint']}>Sign in to your CalDAV server</p>
      <form
        className={styles['form']}
        onSubmit={handleSubmit((credentials) => login.mutate(credentials))}
        noValidate
      >
        <label className={styles['field']}>
          Server URL
          <input
            type="url"
            placeholder="https://dav.example.com/username/"
            autoComplete="url"
            {...register('serverUrl')}
          />
          {errors.serverUrl && <span role="alert">Enter a valid URL</span>}
        </label>
        <label className={styles['field']}>
          Username
          <input autoComplete="username" {...register('username')} />
          {errors.username && <span role="alert">Required</span>}
        </label>
        <label className={styles['field']}>
          Password
          <input
            type="password"
            autoComplete="current-password"
            {...register('password')}
          />
          {errors.password && <span role="alert">Required</span>}
        </label>
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
      </form>
    </main>
  )
}
