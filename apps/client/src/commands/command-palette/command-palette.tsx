import { Dialog } from '@base-ui/react/dialog'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { SHORTCUTS, ShortcutKeys } from '../../shortcuts'
import { colourVar } from '../../lists/lib/list-color'
import { cx } from '../../styles/cx'
import { filterCommands, groupCommands } from '../lib/command-filter'
import type { Command, CommandId } from '../lib/commands'
import { useCommands } from '../lib/use-commands'
import styles from './command-palette.module.css'

/**
 * The command palette (docs/specs/command-palette.md) — `Ctrl+K`.
 *
 * One field over every action in the app: type to filter, arrow to choose,
 * Enter to run. Rendered by `AppModals` rather than beside whatever opens
 * it, for the reason that file exists — Base UI does not draw a nested
 * dialog's backdrop, and the palette can be opened from inside the nav
 * drawer, which is itself a dialog on mobile.
 *
 * It knows nothing about what its commands *do*: choosing one calls back
 * with an id, and the shell's existing shortcut dispatcher performs it.
 * That is what keeps the palette from becoming a second place where the
 * app's actions are implemented.
 */
interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRun: (command: CommandId) => void
}

export function CommandPalette(props: CommandPaletteProps) {
  const commands = useCommands()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  // The query the highlight was last chosen under — see the reset below.
  const [activeQuery, setActiveQuery] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  // Flat for the keyboard, grouped for the eye. The highlight walks one
  // list in one dimension; the headings are drawn around it at render.
  // Grouping first and walking that would make every arrow press ask which
  // heading it was under.
  const groups = useMemo(
    () => groupCommands(filterCommands(commands, query)),
    [commands, query],
  )
  // **The order the eye sees, which is not the order Fuse returned.**
  //
  // Ranking decides the order *within* a group, but the groups themselves
  // are a fixed frame (command-filter.ts — groupCommands), so the best
  // match is not necessarily the top row: searching "tod" ranks "Today"
  // first, while "New todo" is drawn above it under Create. Walking the
  // ranked list would then highlight the second row on open and move the
  // highlight upward on ArrowDown.
  //
  // Flattening the *grouped* result gives one list in the order actually
  // rendered, so the index means what the reader sees.
  // *(fixed 2026-08-20, found in the browser.)*
  const matches = useMemo(
    () => groups.flatMap((group) => group.commands),
    [groups],
  )

  // Cleared on open rather than on close — closing animates, and emptying
  // the field mid-animation shows the reset. Same rule quick add follows.
  useEffect(() => {
    if (props.open) {
      setQuery('')
      setActiveIndex(0)
    }
  }, [props.open])

  // **Clamped during render, not reset in an effect.**
  //
  // The highlight must go back to the top whenever the results change:
  // after another keystroke the old index points at a different command,
  // and running whatever happens to be under it is the one genuinely bad
  // outcome here. An effect cannot do that — it runs *after* the render
  // that already drew the highlight against the new list, so the row
  // under the old index lit up for a frame and, worse, `Enter` in that
  // frame ran it. Measured in the browser: typing "tod" left the
  // highlight on "Today" while the index said 0.
  //
  // Adjusting state *during* render is React's own answer to this (the
  // "derive state from props" escape hatch): it re-renders immediately
  // with the corrected value, before anything is painted or any event can
  // fire against it.
  // *(fixed 2026-08-20, during implementation.)*
  if (activeQuery !== query) {
    setActiveQuery(query)
    setActiveIndex(0)
  }

  const active = matches[activeIndex]

  const run = (command: Command): void => {
    // Close first: the command may open another dialog, and Base UI will
    // not draw a second backdrop over this one.
    props.onOpenChange(false)
    props.onRun(command.id)
  }

  const move = (delta: number): void => {
    if (matches.length === 0) return
    setActiveIndex((current) => {
      const next = (current + delta + matches.length) % matches.length
      scrollIntoView(listRef.current, next)
      return next
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    // `Ctrl+N`/`Ctrl+P` beside the arrows, exactly as quick add's `#`
    // autocomplete does (todos/quick-add-modal) — the same readline
    // convention, and the same reason: the hands stay on the home row
    // through an interaction whose whole point is speed. Two dialects of
    // one interaction is what the single shortcut map exists to prevent,
    // so this is deliberately the same shape rather than an improvement.
    const next =
      event.key === 'ArrowDown' || (event.ctrlKey && event.key === 'n')
    const previous =
      event.key === 'ArrowUp' || (event.ctrlKey && event.key === 'p')

    if (next || previous) {
      event.preventDefault()
      move(next ? 1 : -1)
      return
    }

    if (event.key === 'Enter' && active) {
      event.preventDefault()
      run(active)
    }
    // Escape is deliberately not handled: Base UI's Dialog closes on it,
    // and running nothing is exactly the right outcome.
  }

  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles['backdrop']} />
        <Dialog.Popup className={styles['popup']}>
          {/* Named for screen readers without drawing a heading: the
              field's placeholder is the visible label, and a title bar
              would make this a dialog to read rather than a field to
              type into. Quick add does the same. */}
          <Dialog.Title className={styles['srOnly']}>Commands</Dialog.Title>

          <input
            className={styles['field']}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a command"
            aria-label="Type a command"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />

          <div className={styles['list']} ref={listRef} role="listbox">
            {groups.map((group) => (
              <div key={group.group}>
                <div className={styles['heading']}>{group.heading}</div>
                {group.commands.map((command) => {
                  const index = matches.indexOf(command)
                  const Icon = command.icon
                  return (
                    <button
                      key={command.id}
                      type="button"
                      role="option"
                      aria-selected={index === activeIndex}
                      data-index={index}
                      className={cx(
                        styles['row'],
                        index === activeIndex && styles['rowActive'],
                      )}
                      // Pointer-down rather than click, so the field does
                      // not lose focus before the choice is applied — the
                      // same reason quick add's autocomplete uses it.
                      onMouseDown={(event) => {
                        event.preventDefault()
                        run(command)
                      }}
                      onMouseEnter={() => setActiveIndex(index)}
                    >
                      {command.isList ? (
                        // A list wears its own colour dot, the same mark
                        // the nav gives it (lists/list-dot) — the palette
                        // is a second route to the same place, so it
                        // should not look like a different kind of thing.
                        // *(changed 2026-08-20, on review.)*
                        <span
                          className={cx(
                            styles['dot'],
                            command.color === undefined && styles['dotEmpty'],
                          )}
                          // Through `colourVar`, the same helper the nav
                          // uses. It writes `--marker`, which this dot
                          // paints from (command-palette.module.css) — the
                          // shared rule gives the shape, each caller its
                          // own ground.
                          {...(command.color === undefined
                            ? {}
                            : { style: colourVar(command.color) })}
                          aria-hidden="true"
                        />
                      ) : (
                        <Icon className={styles['icon']} aria-hidden="true" />
                      )}
                      <span className={styles['name']}>{command.name}</span>
                      <Chord command={command.id} />
                    </button>
                  )
                })}
              </div>
            ))}
            {matches.length === 0 && (
              <p className={styles['empty']}>
                No commands match “{query.trim()}”.
              </p>
            )}
          </div>

          {/* The keys, printed rather than hidden behind a trigger: this
              is a keyboard surface, and the hint is how you learn it walks
              with the arrows at all. Hidden on touch, where none of these
              keys exist.

              Named in words rather than drawn as ↑ ↓ ↵: `ShortcutKeys`
              prints "Shift" the same way, and the only glyphs anywhere in
              the app are the two modifier keycaps that ship as icons.
              *(changed 2026-08-20, on review.)* */}
          <div className={styles['hints']}>
            <span>
              <kbd>Up</kbd>
              <kbd>Down</kbd> move
            </span>
            <span>
              <kbd>Enter</kbd> run
            </span>
            <span>
              <kbd>Esc</kbd> close
            </span>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/**
 * The chord that runs this command, if it has one.
 *
 * Shown because the palette is the slower path by definition — anyone who
 * knows the chord presses the chord — so putting it beside the action
 * teaches the faster route while you use the slower one. Lists render
 * nothing here, which is honest: they have no chord and cannot.
 */
function Chord(props: { command: CommandId }) {
  const shortcut = SHORTCUTS.find((entry) => entry.command === props.command)
  if (!shortcut) return null
  return (
    <span className={styles['chord']}>
      <ShortcutKeys shortcut={shortcut} />
    </span>
  )
}

/**
 * Keep the highlighted row in view while the arrows walk past the edge of
 * the scroll box. `block: 'nearest'` so a row already visible does not
 * scroll the list under the pointer.
 */
function scrollIntoView(list: HTMLElement | null, index: number): void {
  const row = list?.querySelector(`[data-index="${index}"]`)
  row?.scrollIntoView({ block: 'nearest' })
}
