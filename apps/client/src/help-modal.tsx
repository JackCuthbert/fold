import { Dialog } from '@base-ui/react/dialog'
import { useRef } from 'react'
import { cx } from './styles/cx'
import styles from './help-modal.module.css'

// docs/specs/ui.md — overlays: same backdrop, popup and animation treatment
// as settings-modal.tsx, which this is modelled on.
//
// The modal is DELIBERATELY a summary — docs/user/ remains the source of
// truth for depth (getting-started, lists, todos, offline, sound). Prose in
// two places guarantees one of them goes stale, so each section says what
// the thing is and how it behaves, and nothing more.
//
// Not rendered by NavFooter, for the same reason SettingsModal isn't: on
// mobile the footer lives inside the nav drawer's Dialog, and Base UI never
// renders a *nested* dialog's backdrop (by design). MainScreen owns the open
// state and renders this as a sibling of the drawer. *(see main-screen.tsx.)*
export function HelpModal(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  // This is the only modal in the app whose body genuinely scrolls, and Base
  // UI's default initial focus is the first tabbable element — here "Close",
  // at the very bottom. Focusing it scrolled the body ~120px on open, past
  // the first section, before the user had read a word. Focus the title
  // instead so the modal opens at the top. (`initialFocus` alone, without a
  // target, did not move focus off the button — it needs the ref.)
  const titleRef = useRef<HTMLHeadingElement>(null)

  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={cx(styles['backdrop'])} />
        <Dialog.Popup className={cx(styles['popup'])} initialFocus={titleRef}>
          <Dialog.Title
            ref={titleRef}
            tabIndex={-1}
            className={cx(styles['title'])}
          >
            About Fold
          </Dialog.Title>
          <div className={styles['body']}>
            {/* docs/specs/today-view.md, docs/specs/summary-view.md */}
            <section className={styles['section']}>
              <h3 className={styles['heading']}>Today and Summary</h3>
              <p>
                Both are derived views, not lists on your server. Today shows
                anything overdue or due today, across every list. Summary shows
                what you&rsquo;ve completed, grouped by day.
              </p>
            </section>
            {/* docs/specs/todos.md */}
            <section className={styles['section']}>
              <h3 className={styles['heading']}>Todos</h3>
              <p>
                A todo can carry a due date, optionally with a time, and a
                priority. Its metadata footer records when it was created and
                completed, how long it stayed open, and whether it landed on
                time.
              </p>
            </section>
            {/* docs/specs/lists.md */}
            <section className={styles['section']}>
              <h3 className={styles['heading']}>Lists</h3>
              <p>Each list is a CalDAV collection on your server.</p>
            </section>
            {/* docs/specs/lists.md — colours and ordering */}
            <section className={styles['section']}>
              <h3 className={styles['heading']}>Colours and ordering</h3>
              <p>
                The palette is a shortcut, not a constraint — any hex colour
                works, and a colour set in another app shows up here exactly as
                stored. Reorder lists with Move up and Move down in a
                list&rsquo;s menu.
              </p>
            </section>
            {/* docs/specs/sync-and-offline.md */}
            <section className={styles['section']}>
              <h3 className={styles['heading']}>Offline</h3>
              <p>Changes queue locally and sync when the connection returns.</p>
            </section>
            {/* docs/specs/lists.md — the extension badges' explanations align
                with this section. */}
            <section className={styles['section']}>
              <h3 className={styles['heading']}>Server extensions</h3>
              <p>
                Colours and ordering aren&rsquo;t part of the core CalDAV
                standard. They use two properties Apple introduced —{' '}
                <code>calendar-color</code> and <code>calendar-order</code> —
                which most servers support, including Radicale.
              </p>
              <p>
                A server that doesn&rsquo;t support them will ignore them rather
                than fail. Colours simply won&rsquo;t appear, and lists will
                fall back to alphabetical order.
              </p>
              {/* The parens are inside the <code> boundary deliberately: a
                  line break between `write (` and `<code>` becomes a JSX
                  whitespace node, rendering "write ( #1D9BF6FF )". */}
              <p>
                Colours are stored in the eight-digit form other clients
                write&nbsp;(<code>#1D9BF6FF</code>), so a colour you set here
                shows up in Apple Reminders and vice versa.
              </p>
            </section>
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
