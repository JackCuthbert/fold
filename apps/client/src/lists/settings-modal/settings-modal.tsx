import { Dialog } from '@base-ui/react/dialog'
import { Toggle } from '@base-ui/react/toggle'
import type { Session } from '@fold/schemas'
import { LuVolume2, LuVolumeOff } from 'react-icons/lu'
import { ModalHeader } from '../../ui'
import { api, persister, queryClient } from '../../providers'
import { useSound } from '../../sound'
import { cx } from '../../styles/cx'
import { PaletteChoice } from '../../theme/palette-choice/palette-choice'
import {
  MODE_LABELS,
  modeSchema,
  PALETTE_GROUPS,
  typefaceSchema,
} from '../../theme/theme'
import { TypefaceChoice } from '../../theme/typeface-choice/typeface-choice'
import { useTheme } from '../../theme/use-theme'
import styles from './settings-modal.module.css'

// docs/specs/ui.md — Settings: appearance, sound and sign out live in their
// own modal, opened from a "Settings" entry in the nav footer — they are
// not loose controls in the nav. Dialog handles focus trapping, scroll
// locking, Escape-to-close and focus restoration to the trigger.
//
// Laid out as titled sections, the same shape the help modal uses
// (help-modal.tsx): a heading, then the controls that belong to it. It was
// previously a flat stack of unlabelled rows, which was fine for two
// controls and stopped being fine when appearance arrived — "Sound" and
// "Parchment" as sibling rows say nothing about which is which kind of
// setting. *(restructured 2026-08-10.)*
interface SettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsModal(props: SettingsModalProps) {
  const { muted, toggleMuted } = useSound()
  const { theme, setPalette, setMode, setTypeface } = useTheme()
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
            <section className={styles['section']}>
              <h3 className={styles['heading']}>Appearance</h3>
              <p className={styles['note']}>
                Stored in this browser only — there is no CalDAV property for a
                theme, so another device keeps its own.
              </p>

              <h4 className={styles['subheading']}>Palette</h4>
              {/* Two families rather than one list of five: the app's own
                  three are variations on one idea, and the borrowed two
                  are not (theme.ts — PALETTE_GROUPS). */}
              {PALETTE_GROUPS.map((group) => (
                <div key={group.label} className={styles['paletteGroup']}>
                  <span className={styles['groupLabel']}>{group.label}</span>
                  <div className={styles['palettes']}>
                    {group.palettes.map((palette) => (
                      <PaletteChoice
                        key={palette}
                        palette={palette}
                        selected={theme.palette === palette}
                        onSelect={setPalette}
                      />
                    ))}
                  </div>
                </div>
              ))}

              <h4 className={styles['subheading']}>Typeface</h4>
              <div className={styles['typefaces']}>
                {typefaceSchema.options.map((typeface) => (
                  <TypefaceChoice
                    key={typeface}
                    typeface={typeface}
                    selected={theme.typeface === typeface}
                    onSelect={setTypeface}
                  />
                ))}
              </div>

              <h4 className={styles['subheading']}>Mode</h4>
              {/* A segmented row rather than a toggle: there are three
                  states and "System" is one of them, which a two-position
                  switch cannot express. */}
              <div className={styles['modes']} role="group" aria-label="Mode">
                {modeSchema.options.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={styles['mode']}
                    aria-pressed={theme.mode === mode}
                    onClick={() => setMode(mode)}
                  >
                    {MODE_LABELS[mode]}
                  </button>
                ))}
              </div>
            </section>

            <section className={styles['section']}>
              <h3 className={styles['heading']}>Sound</h3>
              <div className={styles['row']}>
                <span className={styles['label']}>
                  A quiet pop when a todo is completed
                </span>
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
            </section>

            <section className={styles['section']}>
              <h3 className={styles['heading']}>Account</h3>
              {session && (
                <div className={styles['serverUrl']}>
                  <span className={styles['label']}>CalDAV server</span>
                  <span className={styles['serverUrlValue']}>
                    {session.serverUrl}
                  </span>
                </div>
              )}
              <p className={styles['note']}>
                Signing out is how you change server. Anything not yet synced is
                kept and sent when you sign back in.
              </p>
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
            </section>
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
