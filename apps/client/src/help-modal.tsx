import { Dialog } from '@base-ui/react/dialog'
import type { ReactNode } from 'react'
import { useRef } from 'react'
import { ModalHeader } from './modal-header'
import { ShortcutKeys } from './shortcut-keys'
import { SHORTCUTS } from './shortcuts'
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
  // UI's default initial focus is the first tabbable element — which was
  // "Close", at the very bottom. Focusing it scrolled the body ~120px on
  // open, past the first section, before the user had read a word. Focus the
  // title instead so the modal opens at the top. (`initialFocus` alone,
  // without a target, did not move focus off the button — it needs the ref.)
  //
  // Kept after the header's ✕ replaced that footer Close *(2026-08-03)*:
  // the ✕ is above the scroller rather than below it, so it no longer drags
  // the body down, but focus still belongs on the title — landing on a
  // dismiss control announces "Close" before the modal's own heading.
  const titleRef = useRef<HTMLHeadingElement>(null)

  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={cx(styles['backdrop'])} />
        <Dialog.Popup className={cx(styles['popup'])} initialFocus={titleRef}>
          <ModalHeader titleRef={titleRef}>Help</ModalHeader>
          <div className={styles['body']}>
            {/* docs/specs/ui.md — keyboard shortcuts (issue #5). First,
                because this is now the fastest thing to reach — Cmd/Ctrl+/
                opens the modal you are reading, and someone who arrives
                that way is almost always here for the map.

                Just the list. The rules about when a shortcut stands down
                are true but not worth reading: they describe behaviour you
                never notice working, and they pushed the list itself below
                the fold. *(changed 2026-08-04.)*

                Rendered *from* SHORTCUTS rather than written out, so a
                binding cannot be added without appearing here — the failure
                mode for this kind of documentation is silent drift. */}
            <section className={styles['section']}>
              <h3 className={styles['heading']}>Keyboard shortcuts</h3>
              <dl className={styles['shortcuts']}>
                {SHORTCUTS.map((shortcut) => (
                  <div key={shortcut.action} className={styles['shortcutRow']}>
                    <dt className={styles['shortcutKeys']}>
                      <ShortcutKeys shortcut={shortcut} />
                    </dt>
                    <dd className={styles['shortcutName']}>
                      {shortcut.description}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
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
            {/* docs/specs/list-kinds.md — the feature is invisible until
                it surprises you, so it needs saying somewhere other than
                the sparkle's own popover: someone who has *seen* the
                grouping and wants to know why comes here, not to the
                list they were not looking at. */}
            <section className={styles['section']}>
              <h3 className={styles['heading']}>Lists that do more</h3>
              <p>
                Name a list <UI>Groceries</UI>, <UI>Chores</UI>,{' '}
                <UI>Reading</UI> or <UI>Health</UI> and Fold gives it a little
                extra — a sparkle appears beside its name to say so, and
                clicking that sparkle explains what it does.
              </p>
              <p>
                A grocery list is gathered into a single row in <UI>Today</UI>{' '}
                and <UI>Summary</UI>, since &ldquo;did the shopping&rdquo; is
                the useful fact rather than each item. Both it and a chores list
                can be ticked off all at once.
              </p>
              <p>
                Nothing is stored on your server for this — it is worked out
                from the name each time, so renaming a list changes what it
                does, and another app sees an ordinary list either way.
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

            {/* No footer Close. The header's ✕ is the close control — this
                button sat below the scroll viewport, so you had to scroll
                the whole modal to find it. *(removed 2026-08-03: it is what
                prompted the ✕ in the first place; two close controls in one
                modal is one too many.)* */}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
