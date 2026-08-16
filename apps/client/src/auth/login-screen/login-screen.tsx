import { credentialsSchema, type Credentials } from '@fold/schemas'
import { zodResolver } from '@hookform/resolvers/zod'
import { Form } from '@base-ui/react/form'
import { useMutation } from '@tanstack/react-query'
import { LuOrigami } from 'react-icons/lu'
import { useForm } from 'react-hook-form'
import { ApiError } from '../../api'
import { api, persister, queryClient } from '../../providers'
import {
  readServerIdentity,
  rememberServerIdentity,
  serverIdentity,
} from '../../lib'
import { FoldArtwork } from '../fold-artwork/fold-artwork'
import { PaletteSelect } from '../../theme/palette-select/palette-select'
import { LoginField } from '../login-field/login-field'
import styles from './login-screen.module.css'

// docs/specs/authentication.md — login form, react-hook-form + zod.
// docs/specs/ui.md — every interactive element comes from Base UI; the
// per-field wiring lives in login-field.tsx.
//
// The local compose stack (docs/development/local-caldav-server.md). Dev-only:
// these credentials exist on nobody's real server, so the button must not
// appear in a production build.
const DEMO: Credentials = {
  serverUrl: 'http://localhost:5232/testuser/',
  username: 'testuser',
  password: 'testpass',
}

/**
 * Turn a failed sign-in into something worth reading.
 *
 * Three of these are the BFF's own answers rather than the CalDAV
 * server's, and each would otherwise fall into "could not reach the
 * server" — which is wrong (the server *was* reached) and unhelpful (it
 * sends the user to check a URL that is fine). See docs/specs/security.md
 * for the 403 and 429.
 *
 * A named function rather than a nested ternary: at four branches the
 * expression stopped being readable, and this is the piece a user
 * actually sees when something goes wrong.
 */
export function describeLoginError(error: unknown): string | null {
  if (!error) return null
  if (error instanceof ApiError) {
    switch (error.status) {
      case 403:
        // The operator restricted which CalDAV hosts this deployment may
        // reach. Nothing the user can retry their way out of.
        return 'This Fold only allows certain CalDAV servers. Check the URL, or ask whoever runs it.'
      case 429:
        return 'Too many failed attempts. Wait a few minutes and try again.'
      case 401:
        return 'The CalDAV server rejected these credentials.'
      default:
        break
    }
  }
  return 'Could not reach the server. Check the URL and try again.'
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
    onSuccess: (session) => {
      // docs/specs/authentication.md — cached data is scoped to its
      // server. Signing into a *different* server must not inherit the
      // previous one's lists and todos, so drop the cache in memory and on
      // disk before recording the new identity. On a reload the persister's
      // `buster` (providers.tsx) does the same job for the copy that
      // survives in IndexedDB.
      const identity = serverIdentity(session)
      if (readServerIdentity() !== identity) {
        // Only the *data* queries, never `['session']`: Gate is mounted on
        // that query, and a blanket `clear()` resets its observer to
        // pending — the app blanks out until the refetch lands, rather
        // than going straight to the signed-in shell.
        queryClient.removeQueries({
          predicate: (query) => query.queryKey[0] !== 'session',
        })
        void persister.removeClient()
      }
      rememberServerIdentity(identity)
      queryClient.setQueryData(['session'], session)
    },
  })

  const submitError = describeLoginError(login.error)

  return (
    // docs/specs/ui.md — login: a full-screen split, the artwork on one
    // half and the mark, the blurb and the form on the other. The two
    // halves are siblings of one grid rather than a floating card on a
    // background, so neither can overlap the other at any width, and the
    // form half owns its own scrolling when the viewport is short.
    <div className={styles['page']}>
      {/* Decorative, and the first thing in the DOM would put it ahead of
          the form for a screen reader — so it is `aria-hidden` (see
          fold-artwork.tsx) and the form half carries everything that is
          read. */}
      <div className={styles['canvas']}>
        <FoldArtwork />
      </div>
      <main className={styles['panel']}>
        <div className={styles['content']}>
          <div className={styles['intro']}>
            <p className={styles['mark']}>
              {/* The same origami mark the nav is headed by, so the app
                  introduces itself with the face it keeps
                  (docs/specs/ui.md — the nav is headed by the app's
                  mark). */}
              <LuOrigami aria-hidden="true" size={20} />
              <span className={styles['wordmark']}>Fold</span>
            </p>
            <h1 className={styles['heading']}>
              A calm todo list, kept on your own server.
            </h1>
            {/* docs/specs/overview.md — product intent: only the features
                its owner needs, calm and unhurried, and offline-resilient.
                Three sentences at most: a login page is a door, not a
                landing page. */}
            <p className={styles['blurb']}>
              Fold is a todo client for any CalDAV server. Your todos stay yours
              — no account, no sync service, nothing that nags. It keeps working
              offline and catches up when you are back.
            </p>
          </div>

          <Form
            className={styles['form']}
            onSubmit={handleSubmit((credentials) => login.mutate(credentials))}
          >
            <LoginField
              control={control}
              name="serverUrl"
              label="Server URL"
              type="url"
              autoComplete="url"
              placeholder="https://dav.example.com/username/"
              fallbackError="Enter a valid URL"
            />
            <LoginField
              control={control}
              name="username"
              label="Username"
              autoComplete="username"
              fallbackError="Required"
            />
            <LoginField
              control={control}
              name="password"
              label="Password"
              type="password"
              autoComplete="current-password"
              fallbackError="Required"
            />
            {submitError && (
              <p className={styles['submitError']} role="alert">
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
              <button
                type="button"
                className={styles['demo']}
                onClick={fillDemo}
              >
                Use demo server
              </button>
            )}
          </Form>

          {/* The one piece of reassurance worth the space: the password is
              the user's own server's, and this app is where it stops
              (docs/specs/authentication.md — the client never sees the
              password again after submission). */}
          <div className={styles['foot']}>
            <p className={styles['footnote']}>
              Credentials go to your server and are held only in an encrypted
              session cookie.
            </p>
            {/* The theme is browser-local (docs/specs/themes.md), so it can
                be set before there is an account — and someone who wants
                dark paper at night should not have to sign in to get it.
                Beside the footnote rather than near the form: it is the
                quietest thing on the page and belongs with the other
                quiet thing. *(added 2026-08-10.)* */}
            <PaletteSelect />
          </div>
        </div>
      </main>
    </div>
  )
}
