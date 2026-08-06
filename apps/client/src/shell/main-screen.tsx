import { Dialog } from '@base-ui/react/dialog'
import type { Todo } from '@fold/schemas'
import { useRef, useState, type ReactNode } from 'react'
import { LuMenu } from 'react-icons/lu'
import {
  LIST_FILTER_KEY,
  type ListFilter,
  loadListFilter,
  serialiseListFilter,
  toggleList,
  visibleLists,
} from '../lists/list-filter'
import { hiddenCount } from '../lists/list-filter-menu'
import { kindExplanation } from '../lists/list-kind'
import { useLists } from '../lists/list-nav'
import { useListForm } from '../lists/use-list-form'
import styles from './main-screen.module.css'
import { cx } from '../styles/cx'
import {
  DERIVED_VIEWS,
  isDerivedView,
  isSearchView,
  isSummaryView,
  isTodayView,
  isTomorrowView,
  SEARCH_VIEW,
  SUMMARY_VIEW,
  TODAY_VIEW,
  TOMORROW_VIEW,
} from '../todos/today'
import { TodayDetail } from '../todos/today-pane'
import { useAddTodo } from '../todos/use-add-todo'
import { useGlobalAddTodo } from '../todos/use-global-add-todo'
import { useListActiveTodos } from '../todos/use-list-active-todos'
import { viewIndexOf } from '../shortcuts/shortcuts'
import { useShortcuts } from '../shortcuts/use-shortcuts'
import { useTodoActions } from '../todos/use-todo-actions'
import { useTodoDetailForm } from '../todos/use-todo-detail-form'
import { useViewCount } from '../todos/use-view-count'
import { AppModals } from './app-modals'
import { ListFilterProvider, type ListFilterState } from './list-filter-context'
import { OverlaysProvider, type Overlays } from './overlays-context'
import { SelectionProvider, type Selection } from './selection-context'
import { NavPanel } from './nav-panel'
import { ViewPane, type PaneKind } from './view-pane'
import { ViewHeader } from './view-header'
import { useDetailPanel } from './use-detail-panel'
import { useNavLayout } from './use-nav-layout'
import { useViewSelection } from './use-view-selection'

/**
 * The title and the "what is this?" copy for each derived view.
 *
 * Keyed by view id rather than written into the markup as a ternary chain.
 * With two views the chain was already two levels deep in two separate
 * places — the title and the badge — and a third would have made both
 * unreadable while letting them disagree about which view was showing.
 * A list is absent on purpose: it has a name its owner chose, and nothing
 * about it needs explaining (see the badge below).
 * *(added 2026-08-05: was inline ternaries.)*
 */
const DERIVED_INFO: Record<string, { title: string; about: string }> = {
  [TODAY_VIEW]: {
    title: 'Today',
    about:
      'Everything due today or already overdue, gathered from all your ' +
      'lists. A view, not a list you can add to.',
  },
  [TOMORROW_VIEW]: {
    title: 'Tomorrow',
    // Says what it *excludes*, because that is the only surprising thing
    // about it: someone who knows Today keeps overdue work will reasonably
    // expect this to as well, and someone who ticks a todo off here will
    // watch the row leave (docs/specs/tomorrow-view.md).
    about:
      'What is still to do tomorrow, from all your lists. Nothing ' +
      'overdue — that stays in Today — and anything you finish early ' +
      'moves to the day you did it. A view, not a list you can add to.',
  },
  [SUMMARY_VIEW]: {
    title: 'Summary',
    about:
      'What you’ve finished, grouped by day — handy for a standup. A view, ' +
      'not a list you can add to.',
  },
  [SEARCH_VIEW]: {
    title: 'Search',
    // Says what it searches, because that is the surprising part: every
    // list including hidden ones is *not* the rule (the filter still
    // applies), but finished todos being included is — most search boxes
    // quietly drop them (docs/specs/search-view.md).
    about:
      'Fuzzy search across every todo, matching both the summary and the ' +
      'notes, and including ones you’ve already finished. A view, not a ' +
      'list you can add to.',
  },
}

export function MainScreen() {
  const lists = useLists()
  // Which view is open, its persistence, and the fallback when a persisted
  // list no longer exists — see use-view-selection.ts.
  const view = useViewSelection(lists.data)
  const active = view.active
  // Which todo the panel is showing, and where focus returns on close —
  // see use-detail-panel.ts.
  const detail = useDetailPanel()
  const openTodo = detail.openTodo
  // Where the nav is at this viewport, and what the ☰ does — see
  // use-nav-layout.ts. It needs to know whether the panel is open, since
  // below 1280px an open panel collapses the nav.
  const nav = useNavLayout({ detailOpen: openTodo !== null })
  const { isDesktop, desktopNavOpen, drawerAvailable, drawerOpen } = nav
  const setDrawerOpen = nav.setDrawerOpen
  // Settings lives here, not in NavFooter, for the same reason the other
  // dialogs do: on mobile the footer renders inside the drawer's
  // Dialog.Popup, so a modal owned there is a *nested* dialog — Base UI
  // suppresses a nested dialog's backdrop by design, which cost Settings
  // both its scrim and its click-outside-to-close. Rendered below as a
  // sibling of the drawer, it's a top-level dialog at every viewport.
  // *(fixed 2026-08-01.)*
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Help lives here for exactly the reason Settings does — see above. It is
  // opened from the same nav footer, so a modal owned there would be nested
  // inside the drawer's Dialog on mobile and lose its backdrop too.
  // *(added 2026-08-03.)*
  const [helpOpen, setHelpOpen] = useState(false)
  // docs/specs/list-filter.md — one filter, shared by every derived view.
  //
  // Here rather than in a pane for the reason everything else here is: the
  // button lives in the header and the filtering happens in the panes,
  // which are different components either side of the breakpoint.
  //
  // **Persisted deliberately.** The case is a screenshare, and a filter
  // that silently reset on reload would be worse than none — you would
  // have to re-check it every time you doubted it. *(added 2026-08-05.)*
  const [listFilter, setListFilter] = useState<ListFilter>(() =>
    loadListFilter(localStorage.getItem(LIST_FILTER_KEY)),
  )
  // Revealing every hidden list asks first — the one misclick in this app
  // that is embarrassing rather than merely wrong, since the filter exists
  // for screensharing (list-filter-menu.tsx — RevealListsDialog). Owned
  // here so the dialog is never nested inside the mobile drawer.
  const [revealing, setRevealing] = useState(false)
  // docs/specs/search-view.md — the search query.
  //
  // Here rather than in SearchPane for the reason the detail form is
  // (use-todo-detail-form.ts): the pane lives inside `<main>`, which is
  // rendered by two different trees either side of the 768px breakpoint, so
  // a query owned there is destroyed by a resize.
  //
  // **Not persisted**, unlike the list filter and the selected view. A
  // search is a question you are asking right now, and reopening the app to
  // yesterday's half-remembered query — with results already on screen —
  // would be answering something nobody asked. The issue settles this:
  // transient is fine, it is just another view. *(added 2026-08-06.)*
  const [searchQuery, setSearchQuery] = useState('')

  const changeFilter = (next: ListFilter): void => {
    setListFilter(next)
    const stored = serialiseListFilter(next)
    if (stored === null) localStorage.removeItem(LIST_FILTER_KEY)
    else localStorage.setItem(LIST_FILTER_KEY, stored)
    // Hiding the list you are *looking at* has to move you off it. The
    // point of this filter is that a hidden list is not on the screen, and
    // leaving its todos in the content column while its row disappears
    // from the nav would hide the evidence and keep the contents — the
    // exact failure it exists to prevent. Today is where selection falls
    // back everywhere else (docs/specs/today-view.md — selection).
    // *(added 2026-08-05.)*
    if (next !== null && next.has(active)) {
      selectList(TODAY_VIEW)
    }
  }
  // The list create/edit/delete surfaces live here for the same reason
  // again, plus one more: ListNav is rendered by two different trees either
  // side of the breakpoint, so a modal owned there also *unmounted* on a
  // resize, losing a half-typed list. MainScreen is mounted at every
  // viewport. *(added 2026-08-04, issues #20 and #21.)*
  const listForm = useListForm(lists.data ?? [])
  const showingToday = isTodayView(active)
  const showingTomorrow = isTomorrowView(active)
  const showingSummary = isSummaryView(active)
  const showingSearch = isSearchView(active)
  const showingDerived = isDerivedView(active)
  /** Which pane the selected view resolves to — see view-pane.tsx. */
  const paneKind: PaneKind = showingToday
    ? 'today'
    : showingTomorrow
      ? 'tomorrow'
      : showingSummary
        ? 'summary'
        : showingSearch
          ? 'search'
          : 'list'
  /** Title and explanation when a derived view is showing; null in a list. */
  const derivedInfo = DERIVED_INFO[active] ?? null
  const allLists = lists.data ?? []
  // docs/specs/list-filter.md — the derived views draw only the lists the
  // filter leaves showing. Passed as the pane's `lists`, which is the
  // whole implementation: every derived view already derives its rows,
  // its groups and its health block from that array, so narrowing it
  // narrows all of them at once and none of those files learn about
  // filtering. A list view is never filtered — you asked for that list by
  // name. *(added 2026-08-05.)*
  const shownLists = showingDerived
    ? visibleLists(allLists, listFilter)
    : allLists
  const activeList = allLists.find((list) => list.id === active)
  // docs/specs/list-kinds.md — derived from the name on every render
  // rather than stored: a kind is a Fold opinion about a list, not a fact
  // about it, so renaming the list changes it immediately and there is no
  // cached value to invalidate. *(added 2026-08-05, issue #27.)*
  const kindInfo = activeList ? kindExplanation(activeList.displayName) : null
  // Read from the cache the list pane already fills, never fetched — the
  // header must not become a second reader of the server
  // (use-list-active-todos.ts).
  const listActiveTodos = useListActiveTodos(activeList?.id ?? null)
  // docs/specs/ui.md — the header: the count line, read from the same
  // queries the visible pane already populates, so it costs no request of
  // its own. *(added 2026-08-04.)*
  const viewCount = useViewCount({
    // The filtered set, so the count describes the rows on screen rather
    // than the todos behind a filter. This hook only ever *reads* the
    // cache — the panes do the fetching — so narrowing it here cannot
    // stop a hidden list from loading (docs/specs/list-filter.md).
    lists: shownLists,
    // `lists.data !== undefined`, not `isSuccess`: the persisted cache can
    // hydrate the query as successful before the lists themselves are
    // there, and an empty array then reads as "no lists" rather than "not
    // loaded yet" — which is how the header briefly announced "No todos"
    // on every cold load. *(fixed 2026-08-04.)*
    listsLoaded: lists.data !== undefined,
    listId: activeList?.id ?? null,
    view: showingToday
      ? 'today'
      : showingTomorrow
        ? 'tomorrow'
        : showingSummary
          ? 'summary'
          : showingSearch
            ? 'search'
            : 'list',
    // Only meaningful for the search view, which counts its matches
    // (docs/specs/search-view.md). Every other view ignores it.
    query: searchQuery,
  })
  // A derived view has no collection to add to, so the add path is bound
  // to '' — its trigger isn't rendered either way (docs/specs/today-view.md,
  // docs/specs/summary-view.md).
  const add = useAddTodo(
    showingDerived ? '' : (active ?? ''),
    activeList?.displayName ?? '',
  )
  // The global add path (issue #15): the sidebar button and Cmd/Ctrl+K,
  // both of which can fire from anywhere — including the derived views,
  // which have no list of their own. The list is chosen in the form.
  const globalAdd = useGlobalAddTodo()
  // Where focus returns when the global add modal closes. Null when the
  // chord opened it — there was no trigger, and Base UI then restores to
  // wherever focus was, which is the right answer for a keyboard-invoked
  // dialog. `useRef` rather than state: it is read on close, never
  // rendered (docs/specs/ui.md — accessibility: focus must not land
  // somewhere misleading).
  const globalAddTrigger = useRef<HTMLButtonElement | null>(null)

  // docs/specs/ui.md — keyboard shortcuts (issue #5). One listener owning
  // the whole map; the rules are pure functions in shortcuts.ts.
  //
  // "Obscured" is every dialog *and* the open detail panel, which is a
  // modal sheet on mobile and holds an editable form on desktop — either
  // way, opening a second surface over an edit in progress is not what
  // Cmd+N should do. The drawer is deliberately *not* in this list: a
  // collapsed or closed nav is exactly when reaching for the keyboard
  // beats hunting for the button.
  useShortcuts(
    {
      // Only true *modals* stand a shortcut down — a second dialog on top
      // of one you are already in is never what Cmd+K meant.
      //
      // The detail panel is deliberately absent, even though it holds an
      // unsaved edit. It is a layout column on desktop, not a modal, and
      // treating it as blocking meant the shortcuts stopped working for
      // most of a session — you usually have a todo open. The edit is
      // protected by the rule that already matters more: a shortcut never
      // fires while a field has focus (shortcuts.ts — isTextEntry), which
      // is where you are whenever you are actually mid-edit. Clicking away
      // from the fields and pressing Cmd+K is a deliberate act, and the
      // edit survives it — the panel's state is hoisted here and outlives
      // the modal opening over it (use-todo-detail-form.ts).
      // *(changed 2026-08-04: `openTodo !== null` was in this list.)*
      dialogOpen:
        add.addOpen ||
        globalAdd.open ||
        settingsOpen ||
        helpOpen ||
        listForm.creating ||
        listForm.editing !== null ||
        listForm.deleting !== null,
      // The chord opens the *global* add path, which carries its own list
      // picker — so it works from Today and Summary too, where there is no
      // list to inherit. It needs somewhere to put the todo, though: with
      // no lists at all, the picker would have nothing to offer.
      // *(changed 2026-08-04, issue #15: was bound to the in-list path and
      // did nothing on a derived view.)*
      canAddTodo: (lists.data?.length ?? 0) > 0,
    },
    (action) => {
      if (action === 'new-todo') return globalAdd.setOpen(true)
      if (action === 'new-list') return listForm.openCreate()
      if (action === 'help') return setHelpOpen(true)

      // `go-view:<n>` — the nth derived view, in nav order
      // (todos/today.ts — DERIVED_VIEWS). Resolved here rather than
      // carried on the action so the map stays a list of chords rather
      // than a list of view ids.
      const index = viewIndexOf(action)
      const target = index === null ? undefined : DERIVED_VIEWS[index - 1]
      if (target === undefined) return
      selectList(target)
      // Jumping to a view also closes the drawer: on mobile the nav is an
      // overlay, and landing on a view still behind it would hide the
      // thing you just navigated to. Same reason `onSelect` closes it.
      setDrawerOpen(false)
    },
  )

  const selectList = (listId: string): void => {
    const switching = view.isSwitching(listId)
    view.select(listId)
    // Switching view drops the selection: the open todo may not exist in
    // the list being switched to, and a panel showing a todo from the view
    // you just left is worse than no panel.
    if (switching) detail.close()
  }

  const openDetail = detail.open
  const closeDetail = detail.close

  // Switch the panel to a freshly duplicated todo. The next action after
  // duplicating is almost always editing the copy, so landing on it saves
  // hunting for it in the list — the panel's contents changing under you
  // is unusual for this app, but it is the direct result of a click you
  // just made (issue #25).
  const openCopy = (copy: Todo): void => {
    detail.replace(copy)
  }

  // The detail form lives here, not in the panel, because *this* component
  // is the only one mounted at every viewport. The panel is two different
  // components either side of 768px — an inline column and a portalled
  // sheet — so a form owned by them is destroyed when the layout changes,
  // taking any unsaved edit with it. Called unconditionally (with `null`
  // when nothing is open) to obey the rules of hooks.
  // *(fixed 2026-08-03: an unsaved edit was lost on crossing the
  // breakpoint — see use-todo-detail-form.ts.)*
  //
  // `useTodoActions` is keyed by list, so it binds to the open todo's own
  // list — todos here may come from any of them (Today and Summary draw
  // from several at once). Delete stays with TodayDetail; only Save and
  // Move are needed by the form.
  const detailActions = useTodoActions(openTodo?.listId ?? '')
  const detailForm = useTodoDetailForm(openTodo, {
    onSave: (changes) => {
      if (openTodo) detailActions.update(openTodo, changes)
    },
    onMove: (targetListId) => {
      if (openTodo) detailActions.move(openTodo, targetListId)
    },
    onClose: closeDetail,
  })

  // The nav's contents, rendered twice — inside the drawer on mobile and
  // inside the pinned column on desktop. See nav-panel.tsx.
  //
  // Every handler that closes the drawer does so for one reason: on mobile
  // it is an overlay in its own right, and leaving it open behind a modal
  // would stack two scrims and two focus traps. On desktop `drawerOpen` is
  // already false, so each is a no-op there.
  const navContent: ReactNode = <NavPanel />

  // docs/specs/ui.md — overlays: every overlay dims the background.
  // Base UI never renders a nested dialog's backdrop (by design — see the
  // "Nested dialogs" section of its docs), so the nav drawer's Dialog.Root
  // must NOT wrap the rest of the page: anything inside it (detail sheet,
  // add-todo modal, confirm dialogs, settings) would be misdetected as
  // "nested" the moment it opens, even with the drawer itself closed, and
  // silently lose its own backdrop. Dialog.Root here wraps only the
  // trigger + its own portal — `<main>` is a sibling, outside the tree.
  // Rendered on mobile, and on desktop while the nav is auto-collapsed —
  // there the ☰ opens this overlay instead of re-expanding the pinned
  // column, which would take back the width the collapse just freed
  // (see `navAsDrawer` in use-nav-layout.ts).
  const drawer = (
    <Dialog.Root
      open={drawerAvailable && drawerOpen}
      onOpenChange={setDrawerOpen}
    >
      <Dialog.Trigger className={cx(styles['menuTrigger'])} aria-label="Lists">
        <LuMenu aria-hidden="true" size={20} />
      </Dialog.Trigger>
      {drawerAvailable && (
        <Dialog.Portal>
          <Dialog.Backdrop className={cx(styles['scrim'])} />
          <Dialog.Popup render={<aside />} className={cx(styles['navOpen'])}>
            {navContent}
          </Dialog.Popup>
        </Dialog.Portal>
      )}
    </Dialog.Root>
  )

  // The three contexts the shell's parts read from, rather than being
  // handed everything through props. Each matches a concern that is
  // *written* in one place and *read* in several — see the files
  // themselves for why each earns a context rather than a prop.
  const overlays: Overlays = {
    drawerOpen,
    setDrawerOpen,
    settingsOpen,
    setSettingsOpen,
    helpOpen,
    setHelpOpen,
    revealing,
    setRevealing,
    listForm,
    globalAdd,
    globalAddTriggerRef: globalAddTrigger,
    openOverDrawer: (open) => {
      setDrawerOpen(false)
      open()
    },
  }
  const filterState: ListFilterState = {
    filter: listFilter,
    allLists,
    shownLists,
    toggle: (listId) => changeFilter(toggleList(listFilter, allLists, listId)),
    clear: () => changeFilter(null),
    hiddenCount: hiddenCount(allLists, listFilter),
  }
  const selection: Selection = {
    active,
    select: selectList,
    openDetail,
  }

  return (
    <OverlaysProvider value={overlays}>
      <ListFilterProvider value={filterState}>
        <SelectionProvider value={selection}>
          <div className={styles['layout']}>
            {/* Every modal in the app, as siblings of the drawer rather than
          inside it — see app-modals.tsx for the one reason they all live
          at this level. */}
            <AppModals />
            <div className={styles['body']}>
              {/* docs/specs/ui.md — the nav is collapsible on desktop too, not
            only on mobile, opening to the same comfortable width at both
            sizes (`.nav`'s width in main-screen.module.css matches
            `.navOpen`'s `min(80vw, 20rem)` exactly). Plain markup, not a
            dialog — the desktop nav was never an overlay and doesn't need
            a scrim, focus trap or Escape-to-close; toggling it is a layout
            change, not opening/closing a surface.
            docs/specs/ui.md — overlays: the desktop nav animates too, with
            the same duration/easing as the mobile drawer. Always mounted
            (rather than conditionally rendered) so collapsing/expanding is
            a width transition, not an instant mount/unmount; hidden from
            assistive tech and unreachable by Tab while collapsed, matching
            the mobile drawer's closed state. */}
              {isDesktop && (
                <aside
                  className={cx(
                    styles['nav'],
                    !desktopNavOpen && styles['navCollapsed'],
                  )}
                  aria-hidden={!desktopNavOpen}
                  inert={!desktopNavOpen}
                >
                  <div className={styles['navInner']}>{navContent}</div>
                </aside>
              )}
              <main className={styles['main']}>
                {/* docs/specs/ui.md — mobile: the nav trigger sits beside the
              list title, forming the top row of the content column,
              rather than a floating button in a corner. The title stays
              centred above the list on every viewport. On desktop a
              matching toggle collapses/expands the pinned sidebar.
              docs/specs/ui.md — scrolling: this header is sticky so the
              list title, nav toggle and "Add a todo" stay in view; only
              .mainScroll beneath it scrolls. */}
                <ViewHeader
                  derivedInfo={derivedInfo}
                  activeList={activeList}
                  kindInfo={kindInfo}
                  viewCount={viewCount}
                  listActiveTodos={listActiveTodos}
                  drawer={drawer}
                  drawerAvailable={drawerAvailable}
                  desktopNavOpen={desktopNavOpen}
                  onToggleDesktopNav={nav.toggleDesktopNav}
                />
                <div className={styles['mainScroll']}>
                  <div className={styles['mainScrollInner']}>
                    <ViewPane
                      kind={paneKind}
                      activeList={activeList}
                      add={add}
                      searchQuery={searchQuery}
                      onSearchQueryChange={setSearchQuery}
                    />
                  </div>
                </div>
              </main>
              {/* docs/specs/ui.md — the detail panel: on desktop it is a third
            column of the layout, after `<main>`, not an overlay over it.
            Mirrors the nav's collapse exactly — always mounted so opening
            and closing is a width transition rather than a mount, and
            hidden from assistive tech and unreachable by Tab while closed.
            Deliberately no "select a todo" placeholder: this is a
            single-user app whose owner knows what the panel is, and a
            permanent placeholder would spend a third of the screen saying
            nothing. *(added 2026-08-03, issue #4.)* */}
              {isDesktop && (
                <aside
                  className={cx(
                    styles['detail'],
                    !openTodo && styles['detailCollapsed'],
                  )}
                  aria-hidden={!openTodo}
                  inert={!openTodo}
                >
                  <div className={styles['detailInner']}>
                    {openTodo && (
                      // Deliberately *no* `key={openTodo.uid}` here or on the
                      // sheet below. It used to force a remount when a different
                      // todo was opened, because the form's defaultValues were
                      // built once per mount — but the form no longer lives in
                      // this component, so a remount would no longer re-seed it,
                      // and the surfaces are now cheap to keep. Re-seeding on a
                      // new uid is the hook's job instead
                      // (use-todo-detail-form.ts).
                      <TodayDetail
                        todo={openTodo}
                        lists={lists.data ?? []}
                        form={detailForm}
                        mode="column"
                        focusNonce={detail.openCount}
                        onDuplicated={openCopy}
                        onClose={closeDetail}
                      />
                    )}
                  </div>
                </aside>
              )}
            </div>
            {/* Mobile keeps the modal bottom sheet, unchanged — Base UI's Dialog
          with its scrim, focus trap and Escape (docs/specs/ui.md —
          overlays). Rendered outside `.body` since it is an overlay, not a
          column, and as a sibling of the nav drawer's Dialog rather than
          inside it — see `settingsOpen` above. */}
            {!isDesktop && openTodo && (
              <TodayDetail
                todo={openTodo}
                lists={lists.data ?? []}
                form={detailForm}
                mode="sheet"
                onDuplicated={openCopy}
                onClose={closeDetail}
              />
            )}
          </div>
        </SelectionProvider>
      </ListFilterProvider>
    </OverlaysProvider>
  )
}
