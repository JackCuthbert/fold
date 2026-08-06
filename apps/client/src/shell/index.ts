/**
 * The app frame: the screen itself, its parts, the hooks that hold its
 * state and the contexts they are published through.
 *
 * Deliberately *not* exported to the domains — `shell` imports `todos`,
 * `lists` and `ui`, never the reverse. This barrel is for the entry point
 * and for shell's own parts.
 */
export { AppModals } from './app-modals/app-modals'
export {
  ListFilterProvider,
  useListFilter,
  type ListFilterState,
} from './context/list-filter-context'
export { MainScreen } from './main-screen/main-screen'
export { NavPanel } from './nav-panel/nav-panel'
export {
  OverlaysProvider,
  useOverlays,
  type Overlays,
} from './context/overlays-context'
export {
  SelectionProvider,
  useSelection,
  type Selection,
} from './context/selection-context'
export { ViewHeader } from './view-header/view-header'
export { ViewPane, type PaneKind } from './view-pane/view-pane'
export { useDetailPanel, type DetailPanel } from './hooks/use-detail-panel'
export { useNavLayout, type NavLayout } from './hooks/use-nav-layout'
export {
  useViewSelection,
  type ViewSelection,
} from './hooks/use-view-selection'
