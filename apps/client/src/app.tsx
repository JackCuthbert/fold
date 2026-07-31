import { useQuery } from '@tanstack/react-query'
import { LoginScreen } from './auth/login-screen'
import { MainScreen } from './main-screen'
import { api, AppProviders } from './providers'
import { StatusPill } from './status-pill'
import { ToastProvider } from './toast'

function Gate() {
  const session = useQuery({
    queryKey: ['session'],
    queryFn: api.getSession,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  })
  if (session.isLoading) return null
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
