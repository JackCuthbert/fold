import { Dialog } from '@base-ui/react/dialog'
import type { Todo } from '@fold/schemas'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { LuMenu, LuOrigami, LuSparkles } from 'react-icons/lu'
import { ConfirmDialog } from '../ui/confirm'
import { HelpModal } from '../help/help-modal'
import { InfoBadge } from '../ui/info-badge'
import { ListFormModal } from '../lists/list-form-modal'
import { BulkActions } from '../lists/bulk-actions'
import {
  LIST_FILTER_KEY,
  type ListFilter,
  loadListFilter,
  serialiseListFilter,
  toggleList,
  visibleLists,
} from '../lists/list-filter'
import {
  hiddenCount,
  ListFilterMenu,
  RevealListsDialog,
} from '../lists/list-filter-menu'
import { kindExplanation } from '../lists/list-kind'
import { ListNav, useLists } from '../lists/list-nav'
import { NavFooter } from '../lists/nav-footer'
import { SettingsModal } from '../lists/settings-modal'
import { useListForm } from '../lists/use-list-form'
import styles from './main-screen.module.css'
import { cx } from '../styles/cx'
import { SearchPane } from '../todos/search-pane'
import { SummaryPane } from '../todos/summary-pane'
import { TodayPane } from '../todos/today-pane'
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
import { TodoPane } from '../todos/todo-pane'
import { AddTodoModal } from '../todos/add-todo-modal'
import { useAddTodo } from '../todos/use-add-todo'
import { useGlobalAddTodo } from '../todos/use-global-add-todo'
import { useListActiveTodos } from '../todos/use-list-active-todos'
import { viewIndexOf } from '../shortcuts/shortcuts'
import { useShortcuts } from '../shortcuts/use-shortcuts'
import { useTodoActions } from '../todos/use-todo-actions'
import { useTodoDetailForm } from '../todos/use-todo-detail-form'
import { useViewCount } from '../todos/use-view-count'
import { useMediaQuery } from '../lib/use-media-query'

const SELECTED_LIST_KEY = 'fold:selected-list'
// docs/specs/ui.md — the nav: collapsible on desktop too, pinned open by
// default (chosen as the least disruptive default — the desktop nav has
// always been visible, so opting *out* of it should be the explicit
// action). Persisted so a deliberate collapse survives a reload.
const NAV_PINNED_KEY = 'fold:nav-pinned'
// Matches the `min-width: 768px` breakpoint in main-screen.module.css where
// the nav switches from an overlay drawer to a permanently pinned sidebar.
const DESKTOP_QUERY = '(min-width: 768px)'
// docs/specs/ui.md — the nav: below this width, opening the detail panel
// auto-collapses the nav rather than letting three fixed columns crush the
// list. Derived, not chosen by eye: `.main`'s reading column is `--measure`
// (34rem/544px) plus `--space-4` (16px) of padding either side = 576px, the
// width at which it stops gaining any usable reading space. Add the two
// fixed columns either side — the nav's 20rem (320px) and the detail
// panel's 24rem (384px) — and 320 + 576 + 384 = 1280px is the narrowest
// viewport where all three coexist without `.main` being squeezed below its
// designed measure. Below it, something has to give, and the nav is the
// column that is one tap away. *(added 2026-08-03: between 768px and this
// threshold, `.main` fell to 96px at 800px and 396px at 1100px whenever a
// todo was open — measured; todo rows begin clipping their summary below
// roughly 440px.)*
const THREE_COLUMN_QUERY = '(min-width: 1280px)'

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
  const [selected, setSelected] = useState<string | null>(() =>
    localStorage.getItem(SELECTED_LIST_KEY),
  )
  const [drawerOpen, setDrawerOpen] = useState(false)
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
    if (next !== null && selected !== null && next.has(selected)) {
      selectList(TODAY_VIEW)
    }
  }
  // The list create/edit/delete surfaces live here for the same reason
  // again, plus one more: ListNav is rendered by two different trees either
  // side of the breakpoint, so a modal owned there also *unmounted* on a
  // resize, losing a half-typed list. MainScreen is mounted at every
  // viewport. *(added 2026-08-04, issues #20 and #21.)*
  const listForm = useListForm(lists.data ?? [])
  // docs/specs/ui.md — the detail panel: on desktop the panel is a layout
  // column, a sibling of `<main>` rather than a child, so which todo is
  // open has to live here — a pane inside `<main>` cannot render a column
  // beside it. Held as `{ uid, listId }` rather than a bare uid because
  // Today and Summary draw rows from several lists at once, where a uid
  // alone is ambiguous; that list's mutation actions are bound from it
  // below (`detailActions`) and by TodayDetail.
  // *(added 2026-08-03, issue #4.)*
  const [openTodo, setOpenTodo] = useState<Todo | null>(null)
  // Counts opens, so the panel can move focus into itself on every one —
  // see `openDetail`.
  const [openCount, setOpenCount] = useState(0)
  // The row that opened the panel, so focus can go back to it on close.
  // Explicit rather than inferred: the panel is not modal on desktop, so
  // nothing restores focus for us, and a heuristic is untrustworthy once a
  // save re-renders and reorders the list — the same reasoning as
  // `triggerRef` in add-todo-modal.tsx.
  const openTrigger = useRef<HTMLElement | null>(null)
  const [navPinned, setNavPinned] = useState<boolean>(
    () => localStorage.getItem(NAV_PINNED_KEY) !== '0',
  )
  // On desktop the nav is a permanently pinned sidebar, not a dialog — it's
  // plain markup, CSS-driven exactly as before. On mobile it's a true
  // overlay: Base UI's Dialog takes over the focus trap, scroll lock,
  // Escape-to-close and focus restoration that were previously hand-rolled
  // here (docs/specs/ui.md — prefer Base UI over hand-rolling focus
  // management). The trigger is a Dialog.Trigger (rather than a plain
  // button with manual state) so Base UI's floating tree knows about it —
  // without that wiring, its focus guards can't redirect a Tab that
  // reaches the trigger back into the trap.
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const hasRoomForThree = useMediaQuery(THREE_COLUMN_QUERY)

  // docs/specs/ui.md — the nav: two distinct concepts, deliberately not one
  // boolean. `navPinned` is what the user *wants* and is the only thing
  // persisted; `desktopNavOpen` is what is *currently shown*.
  //
  // Below the three-column threshold, an open detail panel collapses the
  // nav — three fixed columns don't fit, and the alternative measured at
  // 96px of list. The collapse is never written to localStorage: it is a
  // response to the current viewport, not a choice the user made, so it
  // must not follow them to their next visit at a width where it would make
  // no sense. It reverses on its own — close the panel or widen past the
  // threshold and the nav returns, unless the user had collapsed it
  // themselves, in which case `navPinned` is already false and there is
  // nothing to restore. *(added 2026-08-03.)*
  const autoCollapsed = !hasRoomForThree && openTodo !== null
  const desktopNavOpen = isDesktop && navPinned && !autoCollapsed

  // While auto-collapsed the ☰ opens the nav as the **drawer** — the same
  // overlay used on mobile — rather than re-expanding the pinned column.
  //
  // Expanding the column here would defeat the whole point: it would take
  // its 320px back out of a main column that was already too narrow, which
  // is the crush this auto-collapse exists to prevent. Measured: forcing
  // the column open at 1024px with a todo open dropped main to 320px, worse
  // than the 639px it had while collapsed. An overlay costs main nothing.
  //
  // *(fixed 2026-08-03: the override re-expanded the pinned column.)*
  const navAsDrawer = isDesktop && autoCollapsed

  // Only reachable when the nav is a pinned column — while auto-collapsed
  // the header renders the drawer's own trigger instead, so opening the nav
  // there never touches the stored preference.
  const toggleDesktopNav = (): void => {
    const next = !navPinned
    setNavPinned(next)
    localStorage.setItem(NAV_PINNED_KEY, next ? '1' : '0')
  }

  // Close the drawer once the auto-collapse that prompted it lifts —
  // closing the todo, or widening past the threshold — so a drawer opened
  // for a narrow layout doesn't hang over a layout that no longer needs it.
  useEffect(() => {
    if (!autoCollapsed && drawerOpen && isDesktop) setDrawerOpen(false)
  }, [autoCollapsed, drawerOpen, isDesktop])

  // The persisted list may no longer exist (deleted here or elsewhere).
  // Only trust it once we've actually seen the list index: assuming it's
  // valid while `lists.data` is undefined made every load fetch todos for
  // a possibly-deleted list, which 404s on every retry
  // (docs/specs/api.md — error mapping).
  // docs/specs/today-view.md — Today is the default view and the fallback
  // when a persisted list id no longer exists, so selection never lands on
  // an arbitrary list.
  const selectedExists =
    selected !== null &&
    (isDerivedView(selected) ||
      (lists.data?.some((l) => l.id === selected) ?? false))
  const active = (selectedExists ? selected : null) ?? TODAY_VIEW
  const showingToday = isTodayView(active)
  const showingTomorrow = isTomorrowView(active)
  const showingSummary = isSummaryView(active)
  const showingSearch = isSearchView(active)
  const showingDerived = isDerivedView(active)
  // Today and Tomorrow are the same pane over a different day
  // (docs/specs/tomorrow-view.md), so the places that only care "is this a
  // day view" ask once rather than listing both and falling out of step
  // with each other. *(added 2026-08-05.)*
  const showingDay = showingToday || showingTomorrow
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
      const view = index === null ? undefined : DERIVED_VIEWS[index - 1]
      if (view === undefined) return
      selectList(view)
      // Jumping to a view also closes the drawer: on mobile the nav is an
      // overlay, and landing on a view still behind it would hide the
      // thing you just navigated to. Same reason `onSelect` closes it.
      setDrawerOpen(false)
    },
  )

  // Drop a persisted id the server no longer knows about, so it can't come
  // back on the next load.
  useEffect(() => {
    if (!lists.data || selected === null) return
    // A derived view is not a collection, so it is never "missing" from
    // the index (docs/specs/today-view.md, docs/specs/summary-view.md).
    if (isDerivedView(selected)) return
    if (!lists.data.some((list) => list.id === selected)) {
      localStorage.removeItem(SELECTED_LIST_KEY)
      setSelected(null)
    }
  }, [lists.data, selected])

  const selectList = (listId: string): void => {
    // Clicking the list you are already in is not a switch. Closing the
    // open todo there loses your place for no reason — the panel is still
    // showing a todo from the list still on screen.
    // *(fixed 2026-08-03.)*
    const switching = listId !== active
    setSelected(listId)
    localStorage.setItem(SELECTED_LIST_KEY, listId)
    // Switching view drops the selection: the open todo may not exist in
    // the list being switched to, and a panel showing a todo from the view
    // you just left is worse than no panel.
    if (switching) setOpenTodo(null)
  }

  const openDetail = (todo: Todo, trigger: HTMLElement | null): void => {
    openTrigger.current = trigger
    setOpenTodo(todo)
    // Bumped on every open, including re-clicking the row that is already
    // showing. The panel keys its focus effect on this rather than on the
    // todo, because clicking the open row changes neither `openTodo` nor
    // the `key` — so without it that click would leave focus out on the
    // row while the panel sits there looking focused, and the next Escape
    // would go to the row instead of closing the panel.
    setOpenCount((count) => count + 1)
  }

  // Switch the panel to a freshly duplicated todo. The next action after
  // duplicating is almost always editing the copy, so landing on it saves
  // hunting for it in the list — the panel's contents changing under you
  // is unusual for this app, but it is the direct result of a click you
  // just made (issue #25).
  const openCopy = (copy: Todo): void => {
    openDetail(copy, openTrigger.current)
  }

  const closeDetail = (): void => {
    setOpenTodo(null)
    // Return focus to the row that opened the panel. Deferred a frame so
    // it lands after the panel has gone: focusing while the panel is still
    // mounted and about to be made `inert` leaves focus nowhere, which
    // drops the user back to the top of the document.
    const trigger = openTrigger.current
    openTrigger.current = null
    if (trigger) requestAnimationFrame(() => trigger.focus())
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

  // docs/specs/ui.md — the nav has a title above its list of lists, so the
  // panel is labelled rather than starting abruptly. docs/specs/ui.md —
  // overlays: a divider separates a title from its content in modals and
  // side panels — `.navTitle`'s border-bottom is that divider.
  // docs/specs/ui.md — scrolling: inside the nav, the list of lists scrolls
  // while the title and footer (Settings, status) stay anchored.
  // `.navScroll` is the only child that overflows.
  const navContent: ReactNode = (
    <>
      {/* docs/specs/ui.md — the nav is headed by the app's own mark rather
          than a section label: with Today, Summary and the lists all below
          it, "Lists" only described part of what follows. Origami for the
          folded paper the name means. *(changed 2026-08-02.)* */}
      <h2 className={styles['navTitle']}>
        <LuOrigami aria-hidden="true" size={18} />
        Fold
        {/* docs/specs/list-filter.md — the list filter, as a ghost icon
            button at the trailing edge of the title row. It costs no
            vertical space, and the row was empty to the right of the
            mark; every full-width shape tried before gave a
            twice-a-day control the presence of a primary action.

            Here rather than inside ListNav because it owns a
            ConfirmDialog: on mobile ListNav renders inside the drawer's
            Dialog, where a nested dialog gets no backdrop of its own —
            the same trap Settings and the list forms are hoisted out of.
            *(moved 2026-08-05.)* */}
        <ListFilterMenu
          lists={allLists}
          filter={listFilter}
          onToggle={(listId) =>
            changeFilter(toggleList(listFilter, allLists, listId))
          }
          onClear={() => changeFilter(null)}
        />
      </h2>
      <div className={styles['navScroll']}>
        <ListNav
          selected={active}
          form={listForm}
          newTodoRef={globalAddTrigger}
          filter={listFilter}
          onRevealLists={() => setRevealing(true)}
          onNewTodo={() => {
            globalAdd.setOpen(true)
            setDrawerOpen(false)
          }}
          onSelect={(listId) => {
            selectList(listId)
            setDrawerOpen(false)
          }}
        />
      </div>
      <NavFooter
        onOpenHelp={() => {
          setDrawerOpen(false)
          setHelpOpen(true)
        }}
        onOpenSettings={() => {
          // Close the drawer first: on mobile it's an overlay in its own
          // right, and leaving it open behind Settings would stack two
          // scrims and two focus traps. On desktop the nav is plain markup
          // and `drawerOpen` is already false, so this is a no-op there.
          setDrawerOpen(false)
          setSettingsOpen(true)
        }}
      />
    </>
  )

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
  // (see `navAsDrawer`).
  const drawerAvailable = !isDesktop || navAsDrawer
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

  return (
    <div className={styles['layout']}>
      {/* Siblings of `drawer`, never inside it — see `settingsOpen` above. */}
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
      <HelpModal open={helpOpen} onOpenChange={setHelpOpen} />
      {/* docs/specs/list-filter.md — asking before every hidden list
          reappears. A sibling of the drawer for the same reason Settings
          is: it is opened from inside the nav, which is a Dialog on
          mobile. */}
      <RevealListsDialog
        open={revealing}
        count={hiddenCount(allLists, listFilter)}
        onCancel={() => setRevealing(false)}
        onConfirm={() => {
          setRevealing(false)
          changeFilter(null)
        }}
      />
      {/* The global add-todo modal (issue #15), opened by the sidebar
          button or Cmd/Ctrl+K. A sibling of the drawer for the same reason
          Settings and Help are: on mobile the button lives inside the
          drawer's Dialog, and a modal owned there would be nested and lose
          its backdrop.

          Passing `lists` is what turns on the picker (issue #15).

          It defaults to the list you are looking at, and only demands a
          choice when there isn't one — on Today or Summary, which are not
          lists. The original rule was "never default", on the grounds
          that filing a todo into a list you never looked at is worse than
          asking; that reasoning is about the derived views and does not
          survive contact with the case where you are *in* a list and
          press the same shortcut. There, the list on screen is obviously
          the answer, and re-picking it every time is friction.
          *(changed 2026-08-05.)* */}
      <AddTodoModal
        open={globalAdd.open}
        onOpenChange={globalAdd.setOpen}
        target={{
          kind: 'global',
          lists: lists.data ?? [],
          ...(activeList ? { defaultListId: activeList.id } : {}),
          onAdd: (listId, todo) => {
            globalAdd.add(listId, todo)
            // Go to where the todo landed. Creating something and being
            // left looking at a view that may not contain it reads as a
            // failure.
            selectList(listId)
          },
        }}
        triggerRef={globalAddTrigger}
      />
      {/* The list surfaces, here for the same reason and for one more —
          see `listForm` above (issues #20 and #21). Opening one closes the
          drawer: on mobile it's an overlay in its own right, and leaving it
          open behind the modal would stack two scrims and two focus traps,
          exactly as Settings does. */}
      <ListFormModal
        open={listForm.creating}
        title="New list"
        submitLabel="Create"
        onOpenChange={listForm.setCreating}
        onSubmit={(values) => {
          selectList(listForm.submitCreate(values))
          setDrawerOpen(false)
        }}
      />
      <ListFormModal
        open={listForm.editing !== null}
        title="Edit list"
        {...(listForm.editing
          ? {
              initial: {
                displayName: listForm.editing.displayName,
                ...(listForm.editing.color !== undefined
                  ? { color: listForm.editing.color }
                  : {}),
              },
            }
          : {})}
        submitLabel="Save"
        onOpenChange={(open) => {
          if (!open) listForm.closeEdit()
        }}
        onSubmit={(values) => {
          listForm.submitEdit(values)
          setDrawerOpen(false)
        }}
      />
      <ConfirmDialog
        open={listForm.deleting !== null}
        title={`Delete "${listForm.deleting?.displayName ?? ''}"?`}
        confirmLabel="Delete list"
        onCancel={listForm.closeDelete}
        onConfirm={() => {
          listForm.confirmDelete()
          setDrawerOpen(false)
        }}
      >
        <p>This deletes the list and all its todos from the server.</p>
      </ConfirmDialog>
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
          <div className={styles['header']}>
            <div className={styles['headerRow']}>
              {/* The drawer's own trigger whenever the drawer is the
                  surface the ☰ opens — on mobile, and on desktop while
                  auto-collapsed. Base UI needs the trigger inside its
                  `Dialog.Root` to wire focus restoration, so this is the
                  same element either way, not a second button. */}
              {drawerAvailable && drawer}
              {!drawerAvailable && (
                <button
                  type="button"
                  className={cx(styles['menuTrigger'])}
                  aria-label="Lists"
                  aria-pressed={desktopNavOpen}
                  onClick={toggleDesktopNav}
                >
                  <LuMenu aria-hidden="true" size={20} />
                </button>
              )}
              <h1 className={styles['title']}>
                {/* The dot and the name are wrapped together, and it is
                    this shrink-to-fit box — not the full-width `.title` —
                    that the info badge hangs off. Anchoring to `.title`
                    would put the badge at the far edge of the header row,
                    since `.title` is `flex: 1` and fills the space between
                    the ☰ and `.headerSpacer`. See `.titleText`.
                    *(added 2026-08-04.)* */}
                <span className={styles['titleText']}>
                  {/* docs/specs/lists.md — colours: the list's dot travels
                      with its title, so the colour is still there while you
                      are looking at the list (issue #12). Only for a real
                      list, and only when it has a colour — a derived view is
                      not a collection and has none, and an uncoloured list
                      gets nothing rather than the nav's empty ring (see
                      `.titleDot`). */}
                  {activeList?.color !== undefined && (
                    <span
                      className={styles['titleDot']}
                      style={{ background: activeList.color }}
                      aria-hidden="true"
                    />
                  )}
                  {derivedInfo?.title ?? activeList?.displayName ?? 'Todos'}
                  {/* docs/specs/today-view.md, docs/specs/summary-view.md —
                      the explanation of what a derived view *is* belongs
                      beside that view's own title, where someone wondering
                      what they are looking at is already looking. It used to
                      hang off the nav row (list-nav.tsx), which made two of
                      the nav's rows a different shape from all the others.

                      Only the derived views get one: a list is a collection
                      on the server with a name its owner chose, and nothing
                      about it needs explaining.

                      The wording is the nav's, verbatim — shorter than the
                      help modal's on purpose, and saying the same thing
                      (help-modal.tsx, "Today and Summary").
                      *(moved 2026-08-04.)* */}
                  {derivedInfo && (
                    <span className={styles['titleInfo']}>
                      <InfoBadge label={`About ${derivedInfo.title}`}>
                        {derivedInfo.about}
                      </InfoBadge>
                    </span>
                  )}
                  {/* docs/specs/list-kinds.md — the sparkle. A list whose
                      name Fold recognises behaves differently, and that is
                      invisible until it surprises you; this is the thing
                      you hover to find out why. The nav carries the same
                      glyph as a bare marker, and this one carries the
                      explanation. *(added 2026-08-05, issue #27.)* */}
                  {kindInfo && (
                    <span className={styles['titleInfo']}>
                      <InfoBadge
                        label={`About this ${kindInfo.label.toLowerCase()}`}
                        icon={LuSparkles}
                      >
                        <strong>{kindInfo.label}.</strong>{' '}
                        {kindInfo.description}
                      </InfoBadge>
                    </span>
                  )}
                </span>
              </h1>
              <span className={styles['headerSpacer']} aria-hidden="true" />
            </div>
            {/* docs/specs/ui.md — the header: how much is in this view,
                under the title rather than beside it. Beside would break
                the title's centring, which balances the ☰ against
                `.headerSpacer` — a count of changing width ("3 todos" vs
                "128 todos") would shift the title sideways every time a
                todo was ticked. `role="status"` so the change is announced
                rather than only seen. *(added 2026-08-04.)* */}
            {/* Always rendered, so the header's height is the same before
                and after the todos arrive — a conditional line pushed the
                whole list down the moment it appeared. While the count is
                unknown this is a skeleton bar of the same height, and the
                text replaces it in place. *(added 2026-08-04.)* */}
            <p className={styles['count']} role="status">
              {viewCount ?? (
                <span className={styles['countSkeleton']} aria-hidden="true" />
              )}
            </p>
            {/* docs/specs/list-kinds.md — whole-list actions, under the
                count rather than beside the title: like the count, they
                describe the list rather than name it, and putting them on
                the title row would unbalance its centring (see the note
                on `.count`). Renders nothing for a list with no kind, or
                one with nothing left to act on.
                *(added 2026-08-05, issue #27.)* */}
            {activeList && (
              <BulkActions
                listId={activeList.id}
                listName={activeList.displayName}
                active={listActiveTodos}
              />
            )}
            {/* docs/specs/list-filter.md — the list filter is in the nav,
                not here: it hides nav rows as well as todos, and this
                header column was already title + count + actions deep.
                *(moved 2026-08-05.)* */}
          </div>
          <div className={styles['mainScroll']}>
            <div className={styles['mainScrollInner']}>
              {/* Keyed by view so switching remounts the pane, replaying
                  its fade-in (todo-pane.module.css — `.pane`). Without this
                  React reuses the same element and the animation only ever
                  runs once, on first render. */}
              {showingDay ? (
                // One pane for both day views, given the day to show
                // (docs/specs/tomorrow-view.md). `key={active}` already
                // remounts it on the switch, so the two never share state.
                <TodayPane
                  key={active}
                  lists={shownLists}
                  {...(showingTomorrow ? { day: 'tomorrow' as const } : {})}
                  onOpen={openDetail}
                  onOpenList={selectList}
                />
              ) : showingSummary ? (
                <SummaryPane
                  key={active}
                  lists={shownLists}
                  onOpen={openDetail}
                  onOpenList={selectList}
                />
              ) : showingSearch ? (
                // No `onOpenList`: search never groups, so it has no group
                // row to click through (search-pane.tsx).
                <SearchPane
                  key={active}
                  lists={shownLists}
                  query={searchQuery}
                  onQueryChange={setSearchQuery}
                  onOpen={openDetail}
                />
              ) : activeList ? (
                <TodoPane
                  key={active}
                  listId={activeList.id}
                  add={add}
                  onOpen={openDetail}
                />
              ) : (
                <p className={styles['empty']}>Create a list to get started.</p>
              )}
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
                  focusNonce={openCount}
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
  )
}
