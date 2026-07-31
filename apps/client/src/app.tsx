import { useQuery } from '@tanstack/react-query'
import { LoginScreen } from './auth/login-screen'
import { MainScreen } from './main-screen'
import { api, AppProviders } from './providers'
import { StatusPill } from './status-pill'
import { ToastProvider } from './toast'

function Gate() {
  // Always ask the server who we are — never assume from cache, and never
  // treat the answer as permanently fresh. `['session']` is excluded from
  // persistence (see providers.tsx), so this is a real request on every
  // load (docs/specs/authentication.md).
  const session = useQuery({
    queryKey: ['session'],
    queryFn: api.getSession,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    networkMode: 'always',
  })
  // Show neither shell until identity is settled, so a signed-out user
  // never sees a populated app.
  if (session.isPending) return null
  return session.data ? <MainScreen /> : <LoginScreen />
}

export function App() {
  return (
    <ToastProvider>
      <AppProviders>
        <Gate />
        {/* docs/specs/ui.md — status display: the degraded pill is fixed
            to the viewport, independent of the nav/login layout, so it
            mounts once here rather than inside MainScreen. */}
        <StatusPill />
      </AppProviders>
    </ToastProvider>
  )
}
