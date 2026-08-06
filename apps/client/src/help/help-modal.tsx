import { Accordion } from '@base-ui/react/accordion'
import { Dialog } from '@base-ui/react/dialog'
import type { ReactNode } from 'react'
import { useRef } from 'react'
import { LuChevronRight } from 'react-icons/lu'
import { ModalHeader } from '../ui/modal-header'
import { ShortcutKeys } from '../shortcuts/shortcut-keys'
import { SHORTCUTS } from '../shortcuts/shortcuts'
import { cx } from '../styles/cx'
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

/**
 * One collapsed topic.
 *
 * Everything below the shortcuts is folded away by default. There are
 * eight topics now, and stacked open they were a wall of prose you had to
 * scroll past to find the one paragraph you came for — the headings are
 * the index, and an index works better as a list than as chapter titles
 * spread over four screens. *(added 2026-08-05.)*
 *
 * Base UI's Accordion supplies the trigger/panel wiring, the heading
 * semantics and the keyboard handling (docs/specs/ui.md — prefer Base UI
 * over hand-rolling).
 */
function Topic(props: { title: string; children: ReactNode }) {
  return (
    <Accordion.Item className={styles['topic']}>
      <Accordion.Header className={styles['topicHeader']}>
        <Accordion.Trigger className={styles['topicTrigger']}>
          <LuChevronRight
            className={styles['topicChevron']}
            aria-hidden="true"
            size={14}
          />
          {props.title}
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Panel className={styles['topicPanel']}>
        <div className={styles['topicBody']}>{props.children}</div>
      </Accordion.Panel>
    </Accordion.Item>
  )
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
            {/* Everything else, folded away — see `Topic`. `multiple` so
                opening one topic does not close the one you were
                comparing it with.

                Headed like the shortcuts above it: without a heading the
                run of collapsed rows started abruptly, and the two halves
                of the modal read as one list with a table stuck on top. */}
            <section className={styles['section']}>
              <h3 className={styles['heading']}>How Fold works</h3>
              {/* What the app is, then the things it is made of, then what
                  it does with them: About, a todo, the list it lives in,
                  the views over those lists, and finally everything that
                  builds on all three. The derived views led before, which
                  asked the reader to understand a view over lists before
                  either word had been explained.
                  *(reordered 2026-08-05.)* */}
              <Accordion.Root className={styles['topics']} multiple>
                {/* README — personal software. The one topic that is not
                    about a feature: what the app is *for*, which explains
                    the absences (no notifications, no streaks) better than
                    any list of what it does. First because it frames
                    everything under it. *(added 2026-08-05.)* */}
                <Topic title="About Fold">
                  <p>
                    A quiet todo app that talks to your own CalDAV server. It
                    does lists, due dates, priorities and notes, and that really
                    is the lot. No notifications, no streaks, nothing keeping
                    score.
                  </p>
                  <p>
                    Your todos live on your server, not here. Fold has no
                    database and no account of its own, so your stuff stays
                    somewhere you control and any other CalDAV app can read it.
                    It also works fine with no connection and catches up later.
                  </p>
                  <p>
                    It&rsquo;s personal software. It does one person&rsquo;s
                    todos the way they like them, and then it stops.
                  </p>
                  {/* The sign-off, on its own line: it is a colophon rather
                      than another point about the app, and running it on
                      from "…and then stop" made the attribution read as
                      part of the argument. */}
                  <p className={styles['signoff']}>
                    By{' '}
                    <a
                      className={styles['link']}
                      href="https://jackcuthbert.dev"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Jack Cuthbert
                    </a>
                    , in Naarm, Australia.
                  </p>
                </Topic>
                {/* docs/specs/todos.md */}
                <Topic title="Todos">
                  <p>
                    A todo can have a due date, a time of day, and a priority.
                    Tap one to open it, and you&rsquo;ll see when it was created
                    and finished, how long it was open, and whether it made its
                    deadline.
                  </p>
                </Topic>
                {/* docs/specs/lists.md */}
                <Topic title="Lists">
                  <p>
                    Each list is a separate calendar on your CalDAV server, so
                    anything you change here shows up in other apps pointed at
                    the same server.
                  </p>
                </Topic>
                {/* docs/specs/today-view.md, docs/specs/tomorrow-view.md,
                  docs/specs/summary-view.md */}
                <Topic title="Today, Tomorrow and Summary">
                  <p>
                    <UI>Today</UI> gathers everything due today or already
                    overdue, from all your lists at once. <UI>Tomorrow</UI> does
                    the same for the day ahead — but nothing overdue, which
                    stays in Today. <UI>Summary</UI> shows what you&rsquo;ve
                    finished, grouped by day — handy for a standup.
                  </p>
                  <p>
                    None of them is a list you can add to. They&rsquo;re just
                    different ways of looking at the todos you already have.
                  </p>
                </Topic>
                {/* docs/specs/search-view.md — issue #6. Its own topic
                  rather than a line in the one above: the others are ways
                  of slicing by *time*, and this one is not. */}
                <Topic title="Search">
                  <p>
                    <UI>Search</UI> looks through every todo you have, from
                    every list, matching both the title and the notes. It
                    forgives typos, so you don&rsquo;t have to remember exactly
                    what you called something.
                  </p>
                  <p>
                    Finished todos are included, deliberately — the one
                    you&rsquo;re hunting for is often something you already
                    ticked off and half-forgot. Hidden lists are the one
                    exception: if you&rsquo;ve hidden a list, searching
                    won&rsquo;t bring it back.
                  </p>
                </Topic>
                {/* docs/specs/lists.md — colours and ordering */}
                <Topic title="Colours and ordering">
                  <p>
                    Pick a colour from the swatches, or type any hex code you
                    like — the swatches are just a shortcut. A colour you set in
                    another app shows up here unchanged.
                  </p>
                  <p>
                    To rearrange your lists, open the menu at the right of a
                    list and choose <UI>Move up</UI> or <UI>Move down</UI>.
                  </p>
                </Topic>
                {/* docs/specs/list-filter.md — the filter hides rows from the
                  nav, so someone wondering where a list went has no row to
                  click for an explanation. This is where they look. */}
                <Topic title="Hiding lists">
                  <p>
                    The filter icon at the top of the sidebar hides whichever
                    lists you untick. They go from the sidebar as well as from{' '}
                    <UI>Today</UI>, <UI>Tomorrow</UI>, <UI>Summary</UI> and{' '}
                    <UI>Search</UI> — a hidden list stays hidden even if you go
                    looking for it. Handy when you&rsquo;re sharing your screen
                    and your personal lists are nobody else&rsquo;s business.
                  </p>
                  <p>
                    Nothing is deleted or changed on your server, and it stays
                    on until you turn it off, including after a reload.{' '}
                    <UI>N lists hidden</UI> appears under your lists to say so;
                    click it to bring them all back.
                  </p>
                  <p>
                    A list you make while others are hidden is always visible,
                    so a filter set last week can never swallow something new.
                  </p>
                </Topic>
                {/* docs/specs/list-kinds.md — the feature is invisible until
                  it surprises you, so it needs saying somewhere other than
                  the sparkle's own popover: someone who has *seen* the
                  grouping and wants to know why comes here, not to the
                  list they were not looking at. */}
                <Topic title="Lists that do more">
                  <p>
                    Some list names mean something to Fold, and a list with one
                    gets a little extra. A <strong>sparkle</strong> beside its
                    name says so; click that sparkle to see what it does.
                  </p>
                  <dl className={styles['kinds']}>
                    <dt>Groceries</dt>
                    <dd>
                      Gathered into a single row in <UI>Today</UI> and{' '}
                      <UI>Summary</UI>, since &ldquo;did the shopping&rdquo; is
                      the useful fact rather than each item. Tick the lot off at
                      once.
                    </dd>
                    <dt>Chores</dt>
                    <dd>
                      Tick the lot off at once, or give every todo in it the
                      same due date. A Saturday&rsquo;s jobs are all due
                      Saturday.
                    </dd>
                    <dt>Reading</dt>
                    <dd>
                      Things to get to rather than things due by a date, so no
                      due dates at all. Set a priority to say what&rsquo;s next.
                    </dd>
                    <dt>Health</dt>
                    <dd>
                      Leads <UI>Today</UI> and <UI>Tomorrow</UI> in a block of
                      its own, because health shouldn&rsquo;t wait behind a
                      chore.
                    </dd>
                  </dl>
                  <p>
                    <strong>Other names work too.</strong> Each one matches a
                    dozen or so names, not just the one listed above.{' '}
                    <UI>Shopping</UI>, <UI>Supermarket</UI>, <UI>Housework</UI>,{' '}
                    <UI>Errands</UI>, <UI>Books</UI>, <UI>Watching</UI>,{' '}
                    <UI>Someday</UI>, <UI>Meds</UI> and <UI>Appointments</UI>{' '}
                    all count. See{' '}
                    <code className={styles['inlineCode']}>
                      docs/user/list-kinds.md
                    </code>{' '}
                    for the full set.
                  </p>
                  <p>
                    Matching is on the <em>whole</em> name and ignores capitals,
                    so &ldquo;Weekend shopping&rdquo; is just an ordinary list.
                    Anything that changes how a list behaves should be
                    predictable from its name alone.
                  </p>
                  <p>
                    Nothing is stored on your server for this. It&rsquo;s worked
                    out from the name each time, so renaming a list changes what
                    it does, and another app just sees an ordinary list.
                  </p>
                </Topic>
                {/* docs/specs/sync-and-offline.md */}
                <Topic title="Working offline">
                  <p>
                    You can keep using Fold with no connection. Anything you
                    change is saved on this device and sent to your server
                    automatically once it&rsquo;s reachable again — nothing is
                    lost if you close the app in the meantime.
                  </p>
                  <p>
                    The dot at the bottom of the sidebar tells you where things
                    stand: green when everything has reached your server, amber
                    while it&rsquo;s sending, red when it can&rsquo;t reach it.
                  </p>
                </Topic>
                {/* docs/specs/lists.md — the extension badges' explanations
                  align with this section. One sub-heading per extension, so
                  more can be added without the prose turning into a list of
                  caveats. */}
                <Topic title="Server extensions">
                  <p>
                    A couple of features rely on parts of CalDAV that Apple
                    added rather than the original standard. Most servers
                    support them, Radicale included. A server that doesn&rsquo;t
                    will simply ignore them — nothing breaks, the feature just
                    has no effect.
                  </p>

                  <h4 className={styles['subheading']}>
                    List colours <code>calendar-color</code>
                  </h4>
                  {/* The opening paren is glued to <code> with &nbsp; so oxfmt
                    can't break the line between them — a break there becomes
                    a JSX whitespace node and renders "write ( #1D9BF6FF )".
                    Only one space precedes it. */}
                  <p>
                    Stored in the same eight-digit form other clients
                    write&nbsp;(
                    <code>#1D9BF6FF</code>), so a colour you choose here shows
                    up in Apple Reminders, and one set there shows up here. On a
                    server without support, lists stay uncoloured.
                  </p>

                  <h4 className={styles['subheading']}>
                    List order <code>calendar-order</code>
                  </h4>
                  <p>
                    Your chosen order is stored on the server, so it follows you
                    to your other devices. On a server without support, lists
                    fall back to alphabetical.
                  </p>
                </Topic>
              </Accordion.Root>
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
