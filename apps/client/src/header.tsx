import { useIsFetching } from '@tanstack/react-query'
import { api, queryClient, useOnline, useSyncStatus } from './providers'
import { useSound } from './sound/use-sound'

export function Header(props: {
  title: string
  onMenu: () => void
  /** So the drawer can restore focus here when it closes. */
  ref?: React.Ref<HTMLButtonElement>
}) {
  const online = useOnline()
  const { pending, blocked } = useSyncStatus()
  const fetching = useIsFetching()
  const { muted, toggleMuted } = useSound()

  return (
    <header className="header">
      <button
        ref={props.ref}
        type="button"
        className="header__menu"
        aria-label="Lists"
        onClick={props.onMenu}
      >
        ☰
      </button>
      <h1 className="header__title">{props.title}</h1>
      <div className="header__status">
        {!online && (
          <span className="pill pill--offline">
            Offline{pending > 0 ? ` · ${pending} queued` : ''}
          </span>
        )}
        {online && blocked === 'server' && (
          <span className="pill pill--offline">
            Server unreachable{pending > 0 ? ` · ${pending} queued` : ''}
          </span>
        )}
        {online && blocked !== 'server' && pending > 0 && (
          <span className="pill pill--syncing">
            Syncing {pending} change{pending === 1 ? '' : 's'}
          </span>
        )}
        {online && blocked !== 'server' && pending === 0 && fetching > 0 && (
          <span className="pill">Refreshing</span>
        )}
        <button
          type="button"
          className="header__sound"
          aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
          onClick={toggleMuted}
        >
          {muted ? '🔇' : '🔊'}
        </button>
        <button
          type="button"
          className="header__signout"
          onClick={() => {
            // Outbox is preserved; it replays after the next sign-in
            // (docs/specs/authentication.md).
            void api.logout().catch(() => {})
            queryClient.setQueryData(['session'], null)
          }}
        >
          Sign out
        </button>
      </div>
    </header>
  )
}
