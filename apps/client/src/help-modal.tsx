import { Dialog } from '@base-ui/react/dialog'
import type { ReactNode } from 'react'
import { useRef } from 'react'
import { cx } from './styles/cx'
import styles from './help-modal.module.css'

/**
 * Names a control the reader can actually go and click — a button, a menu
 * item, a view in the nav.
 *
 * Set apart from the surrounding prose so "choose Move up" reads as an
 * instruction pointing at a real thing on screen, rather than as a phrase
 * the reader has to work out. Distinct from `<code>`, which is for
 * CalDAV property names — things on the *server*, which the reader can
 * never click.
 */
function UI(props: { children: ReactNode }) {
  return <span className={styles['ui']}>{props.children}</span>
}

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
                <UI>Today</UI> gathers everything due today or already overdue,
                from all your lists at once. <UI>Summary</UI> shows what
                you&rsquo;ve finished, grouped by day — handy for a standup.
              </p>
              <p>
                Neither is a list you can add to. They&rsquo;re just different
                ways of looking at the todos you already have.
              </p>
            </section>
            {/* docs/specs/todos.md */}
            <section className={styles['section']}>
              <h3 className={styles['heading']}>Todos</h3>
              <p>
                A todo can have a due date, a time of day, and a priority. Tap
                one to open it, and you&rsquo;ll see when it was created and
                finished, how long it was open, and whether it made its
                deadline.
              </p>
            </section>
            {/* docs/specs/lists.md */}
            <section className={styles['section']}>
              <h3 className={styles['heading']}>Lists</h3>
              <p>
                Each list is a separate calendar on your CalDAV server, so
                anything you change here shows up in other apps pointed at the
                same server.
              </p>
            </section>
            {/* docs/specs/lists.md — colours and ordering */}
            <section className={styles['section']}>
              <h3 className={styles['heading']}>Colours and ordering</h3>
              <p>
                Pick a colour from the swatches, or type any hex code you like —
                the swatches are just a shortcut. A colour you set in another
                app shows up here unchanged.
              </p>
              <p>
                To rearrange your lists, open the menu at the right of a list
                and choose <UI>Move up</UI> or <UI>Move down</UI>.
              </p>
            </section>
            {/* docs/specs/sync-and-offline.md */}
            <section className={styles['section']}>
              <h3 className={styles['heading']}>Working offline</h3>
              <p>
                You can keep using Fold with no connection. Anything you change
                is saved on this device and sent to your server automatically
                once it&rsquo;s reachable again — nothing is lost if you close
                the app in the meantime.
              </p>
              <p>
                The dot at the bottom of the sidebar tells you where things
                stand: green when everything has reached your server, amber
                while it&rsquo;s sending, red when it can&rsquo;t reach it.
              </p>
            </section>
            {/* docs/specs/lists.md — the extension badges' explanations align
                with this section. One sub-heading per extension, so more can
                be added without the prose turning into a list of caveats. */}
            <section className={styles['section']}>
              <h3 className={styles['heading']}>Server extensions</h3>
              <p>
                A couple of features rely on parts of CalDAV that Apple added
                rather than the original standard. Most servers support them,
                Radicale included. A server that doesn&rsquo;t will simply
                ignore them — nothing breaks, the feature just has no effect.
              </p>

              <h4 className={styles['subheading']}>
                List colours <code>calendar-color</code>
              </h4>
              {/* The opening paren is glued to <code> with &nbsp; so oxfmt
                  can't break the line between them — a break there becomes a
                  JSX whitespace node and renders "write ( #1D9BF6FF )". Only
                  one space precedes it. */}
              <p>
                Stored in the same eight-digit form other clients write&nbsp;(
                <code>#1D9BF6FF</code>), so a colour you choose here shows up in
                Apple Reminders, and one set there shows up here. On a server
                without support, lists stay uncoloured.
              </p>

              <h4 className={styles['subheading']}>
                List order <code>calendar-order</code>
              </h4>
              <p>
                Your chosen order is stored on the server, so it follows you to
                your other devices. On a server without support, lists fall back
                to alphabetical.
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
