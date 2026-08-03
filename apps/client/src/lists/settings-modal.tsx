import { Dialog } from '@base-ui/react/dialog'
import { Toggle } from '@base-ui/react/toggle'
import type { Session } from '@fold/schemas'
import { LuVolume2, LuVolumeOff } from 'react-icons/lu'
import { ModalHeader } from '../modal-header'
import { api, queryClient } from '../providers'
import { useSound } from '../sound/use-sound'
import { cx } from '../styles/cx'
import styles from './settings-modal.module.css'

// docs/specs/ui.md — Settings: sound and sign out live in their own modal,
// opened from a "Settings" entry in the nav footer — they are not loose
// controls in the nav. Dialog handles focus trapping, scroll locking,
// Escape-to-close and focus restoration to the trigger.
export function SettingsModal(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
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
                // Outbox is preserved; it replays after the next sign-in
                // (docs/specs/authentication.md).
                void api.logout().catch(() => {})
                queryClient.setQueryData(['session'], null)
              }}
            >
              Sign out
            </button>
            <button
              type="button"
              className={styles['close']}
              onClick={() => props.onOpenChange(false)}
            >
              Close
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
