import { Dialog } from '@base-ui/react/dialog'
import { Toggle } from '@base-ui/react/toggle'
import type { Session } from '@fold/schemas'
import { LuVolume2, LuVolumeOff } from 'react-icons/lu'
import { ModalHeader } from '../../ui/modal-header/modal-header'
import { api, persister, queryClient } from '../../providers'
import { useSound } from '../../sound/use-sound'
import { cx } from '../../styles/cx'
import styles from './settings-modal.module.css'

// docs/specs/ui.md — Settings: sound and sign out live in their own modal,
// opened from a "Settings" entry in the nav footer — they are not loose
// controls in the nav. Dialog handles focus trapping, scroll locking,
// Escape-to-close and focus restoration to the trigger.
interface SettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsModal(props: SettingsModalProps) {
  const { muted, toggleMuted } = useSound()
  // docs/specs/ui.md — Settings: the CalDAV server URL is visible here,
  // read-only — useful to confirm which server you're on. Signing out is
  // how you change it. `['session']` is never persisted (providers.tsx)
  // and always freshly fetched by app.tsx's Gate, so reading it from the
  // query cache here is the same identity the rest of the app trusts —
  // no separate fetch of our own.
  const session = queryClient.getQueryData<Session>(['session'])

  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={cx(styles['backdrop'])} />
        <Dialog.Popup className={cx(styles['popup'])}>
          <ModalHeader>Settings</ModalHeader>
          <div className={styles['body']}>
            {session && (
              <div className={styles['serverUrl']}>
                <span className={styles['label']}>CalDAV server</span>
                <span className={styles['serverUrlValue']}>
                  {session.serverUrl}
                </span>
              </div>
            )}
            <div className={styles['row']}>
              <span className={styles['label']}>Sound</span>
              <Toggle
                pressed={muted}
                onPressedChange={toggleMuted}
                className={styles['toggle']}
                aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
              >
                {muted ? (
                  <LuVolumeOff aria-hidden="true" size={16} />
                ) : (
                  <LuVolume2 aria-hidden="true" size={16} />
                )}
                {muted ? 'Muted' : 'On'}
              </Toggle>
            </div>
            <button
              type="button"
              className={styles['signOut']}
              onClick={() => {
                // The outbox is preserved and replays after the next
                // sign-in (docs/specs/authentication.md). It is now
                // namespaced per server, so what replays can only ever be
                // this server's own queued writes.
                //
                // The read cache is *not* preserved: leaving it in place
                // showed the previous server's lists and todos under the
                // next account's credentials. Clearing here covers the
                // signed-out window; the persister's `buster`
                // (providers.tsx) covers a reload.
                void api.logout().catch(() => {})
                // Data queries only — `['session']` is set to null just
                // below, and removing the query Gate is mounted on would
                // blank the app instead of showing the login screen.
                queryClient.removeQueries({
                  predicate: (query) => query.queryKey[0] !== 'session',
                })
                void persister.removeClient()
                queryClient.setQueryData(['session'], null)
              }}
            >
              Sign out
            </button>
            {/* No footer Close. The header's ✕ is the close control, as in
                the help modal — no modal in the app carries two of them
                (docs/specs/ui.md — overlays: closing a modal).
                *(removed 2026-08-03.)* */}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
