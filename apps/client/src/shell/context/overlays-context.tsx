import { createContext, use, type ReactNode, type RefObject } from 'react'
import type { CommandId } from '../../commands/lib/commands'
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
  /** The command palette (docs/specs/command-palette.md, issue #26). */
  paletteOpen: boolean
  setPaletteOpen: (open: boolean) => void
  /**
   * Perform a command — the same dispatcher the shortcut map runs on, so a
   * chord and a palette row cannot come to mean different things.
   */
  runCommand: (command: CommandId) => void
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
   * Close the drawer, then run `act`.
   *
   * **For navigation, not for modals.** Choosing a list from the nav
   * changes what is behind the drawer, so the drawer has done its job and
   * should get out of the way.
   *
   * A *modal* opened from the nav does the opposite: it stacks above the
   * drawer and leaves it open (docs/specs/ui.md — overlays). This used to
   * be applied to Settings, Help and the global add too, on the reasoning
   * that two scrims and two focus traps was a problem — but Edit list has
   * always stacked without one, and closing the drawer meant dismissing
   * the modal dropped you somewhere you had not navigated to.
   * *(narrowed 2026-08-09.)*
   */
  openOverDrawer: (act: () => void) => void
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
