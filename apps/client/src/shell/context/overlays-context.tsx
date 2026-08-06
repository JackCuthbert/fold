import { createContext, use, type ReactNode, type RefObject } from 'react'
import type { ListFormState } from '../../lists/hooks/use-list-form'
import type { useGlobalAddTodo } from '../../todos/hooks/use-global-add-todo'

export interface Overlays {
  /** The mobile nav drawer. */
  drawerOpen: boolean
  setDrawerOpen: (open: boolean) => void
  settingsOpen: boolean
  setSettingsOpen: (open: boolean) => void
  helpOpen: boolean
  setHelpOpen: (open: boolean) => void
  /** The "show every hidden list?" confirmation. */
  revealing: boolean
  setRevealing: (revealing: boolean) => void
  /** Create / edit / delete a list — see lists/use-list-form.ts. */
  listForm: ListFormState
  /** The add-todo path that carries its own list picker (issue #15). */
  globalAdd: ReturnType<typeof useGlobalAddTodo>
  /** So the add-todo modal can restore focus to the button that opened it. */
  globalAddTriggerRef: RefObject<HTMLButtonElement | null>
  /**
   * Close the drawer, then run `open`.
   *
   * Every surface opened from inside the nav needs this: on mobile the
   * drawer is an overlay in its own right, and leaving it open behind a
   * modal stacks two scrims and two focus traps. On desktop the drawer is
   * already closed, so it costs nothing. Bundled here so the rule lives in
   * one place rather than being remembered at each of the five call sites.
   */
  openOverDrawer: (open: () => void) => void
}

const OverlaysContext = createContext<Overlays | null>(null)

/**
 * Every modal surface's open state, plus the two form hooks that drive
 * them.
 *
 * **These are all owned above the layout for one reason** (see
 * app-modals.tsx): Base UI renders no backdrop for a nested dialog, and on
 * mobile the nav is itself a `Dialog`. So the modals render as siblings of
 * the drawer while the buttons that open them live inside it — which is
 * exactly the shape that produces prop drilling, since the state has to
 * travel down one branch to be *read* and down another to be *written*.
 *
 * A context short-circuits that: `AppModals` reads the flags, `NavPanel`
 * writes them, and nothing in between has to mention them.
 *
 * *(added 2026-08-06, issue #28.)*
 */
interface OverlaysProviderProps {
  value: Overlays
  children: ReactNode
}

export function OverlaysProvider(props: OverlaysProviderProps) {
  return <OverlaysContext value={props.value}>{props.children}</OverlaysContext>
}

export function useOverlays(): Overlays {
  const value = use(OverlaysContext)
  if (!value) throw new Error('useOverlays outside OverlaysProvider')
  return value
}
