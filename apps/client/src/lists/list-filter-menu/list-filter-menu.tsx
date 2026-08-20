import { Checkbox } from '@base-ui/react/checkbox'
import { Popover } from '@base-ui/react/popover'
import type { TodoList } from '@fold/schemas'
import { LuCheck, LuEyeOff, LuListFilter } from 'react-icons/lu'
import { ConfirmDialog, Tooltip } from '../../ui'
import { cx } from '../../styles/cx'
import { colourVar } from '../lib/list-color'
import { isNarrowed, type ListFilter, visibleLists } from '../lib/list-filter'
import styles from './list-filter-menu.module.css'

/**
 * What the filter is currently hiding, as the last row of the nav's list
 * group (docs/specs/list-filter.md).
 *
 * **Where the hidden lists would have been.** A status dot on the trigger
 * said only *that* something was filtered, from the top of the group; this
 * says how many and sits exactly where the missing rows were, which is
 * where the eye goes when a list you expected is not there.
 *
 * Ghost styling, like the "Add a todo…" row it echoes: it is a note about
 * the list above it rather than another place to go.
 * *(changed 2026-08-05: was a dot on the trigger.)*
 *
 * **It asks before revealing** — see `RevealListsDialog` below, which
 * MainScreen renders. *(added 2026-08-05.)*
 */
interface HiddenListsRowProps {
  lists: readonly TodoList[]
  filter: ListFilter
  /** Ask to reveal them — the dialog lives in MainScreen, see below. */
  onReveal: () => void
}

export function HiddenListsRow(props: HiddenListsRowProps) {
  const hidden = hiddenCount(props.lists, props.filter)
  if (hidden === 0) return null
  return (
    <button type="button" className={styles['hidden']} onClick={props.onReveal}>
      {/* An icon so the text starts on the same edge as every row above
          it: without one this row's words began where their names do,
          against icons and colour dots, and the column had a notch in it.
          `LuEyeOff` for what the row reports — lists hidden from view —
          and clicking it is what takes the eye-off away.
          *(added 2026-08-20.)* */}
      <LuEyeOff aria-hidden="true" size={16} />
      {hidden} {hidden === 1 ? 'list' : 'lists'} hidden
    </button>
  )
}

/** How many lists the filter is hiding right now. */
export function hiddenCount(
  lists: readonly TodoList[],
  filter: ListFilter,
): number {
  return lists.length - visibleLists(lists, filter).length
}

/**
 * The confirm behind "N lists hidden".
 *
 * **Revealing asks first.** This is the one control in the app whose
 * misclick is embarrassing rather than merely wrong: the filter exists for
 * screensharing, and a stray click would put every hidden list on a
 * projector in front of colleagues. Unhiding is trivially reversible, so
 * the confirm is green rather than red for the same reason the bulk
 * actions are — spending Delete's red on a reversible action is what stops
 * that red working where it matters (confirm.tsx — `tone`).
 *
 * Rendered by MainScreen rather than beside the row that opens it: on
 * mobile the nav is a Dialog, and Base UI gives a nested dialog no
 * backdrop of its own — the same trap Settings, Help and the list forms
 * are all hoisted out of (main-screen.tsx). *(added 2026-08-05.)*
 */
interface RevealListsDialogProps {
  open: boolean
  count: number
  onCancel: () => void
  onConfirm: () => void
}

export function RevealListsDialog(props: RevealListsDialogProps) {
  const one = props.count === 1
  const noun = one ? 'list' : 'lists'
  return (
    <ConfirmDialog
      open={props.open}
      title={`Show ${props.count} hidden ${noun}?`}
      confirmLabel="Show them"
      tone="affirmative"
      onCancel={props.onCancel}
      onConfirm={props.onConfirm}
    >
      <p>
        {one ? 'It' : 'They'} will reappear in the sidebar and in Today,
        Tomorrow and Summary. You can hide {one ? 'it' : 'them'} again from{' '}
        <strong>Filter lists</strong>.
      </p>
    </ConfirmDialog>
  )
}

/**
 * The list filter (docs/specs/list-filter.md).
 *
 * A row in the nav that opens a checkbox per list. **In the nav rather
 * than the content header**, for two reasons that turned out to be the
 * same one: the header stack was already title + count + bulk actions deep
 * in a column that scrolls, and — decisively — a hidden list must vanish
 * from the *nav* too. Filtering the views while leaving "Therapy" legible
 * in the sidebar defeats the entire point during a screenshare.
 * *(moved 2026-08-05: was beside the count line.)*
 *
 * **Not a per-list setting.** The case is "I am sharing my screen" — a
 * thing you turn on and off in one gesture, twice — rather than a property
 * of a list that outlives the call.
 *
 * Renders nothing with fewer than two lists: with one list there is
 * nothing to narrow to, and a control that can only ever hide everything
 * (or nothing) is noise.
 */
interface ListFilterMenuProps {
  /**
   * Hide the "a filter is on" badge, leaving the accent-coloured icon to
   * say it alone.
   *
   * For the nav's Lists heading, where the button is 24px on a pointer
   * rather than the 34–44px the badge was sized against — at that size an
   * 8px dot and its halo cover most of the glyph they are meant to
   * qualify. *(added 2026-08-20.)*
   */
  hideBadge?: boolean
  lists: readonly TodoList[]
  filter: ListFilter
  onToggle: (listId: string) => void
  onClear: () => void
}

export function ListFilterMenu(props: ListFilterMenuProps) {
  if (props.lists.length < 2) return null

  const shown = visibleLists(props.lists, props.filter).length
  // What the filter actually does right now, not what is stored. A set
  // naming two deleted lists hides nothing, and the button must not claim
  // otherwise (list-filter.ts — isNarrowed).
  const narrowed = isNarrowed(props.lists, props.filter)

  return (
    <Popover.Root>
      {/* The tooltip wraps the *trigger*, and Base UI composes the two
          onto one button via `render` — so the popover's own trigger
          behaviour is untouched and no extra element enters the heading
          row, which measures its buttons for the kebab column.
          *(added 2026-08-20.)* */}
      <Tooltip label="Filter lists">
        <Popover.Trigger
          className={cx(styles['trigger'], narrowed && styles['triggerOn'])}
          // An icon button, so the name carries everything — including
          // the count, which a screen reader would otherwise never get.
          // The "N lists hidden" row below is what states it visually.
          aria-label={
            narrowed
              ? `Filter lists — showing ${shown} of ${props.lists.length}`
              : 'Filter lists'
          }
        >
          <LuListFilter aria-hidden="true" size={16} />
          {/* A filter is on. The "N lists hidden" row says the same thing
              in words, but it is at the *other end* of the nav — below the
              lists, where the missing rows were — so from up here the dot
              is the only thing carrying it. *(re-added 2026-08-05, once
              the trigger moved to the title row and they were far
              apart.)* */}
          {narrowed && !props.hideBadge && (
            <span className={styles['dotOn']} aria-hidden="true" />
          )}
        </Popover.Trigger>
      </Tooltip>
      <Popover.Portal>
        {/* Anchored by its trailing edge, not centred: the trigger sits
            at the nav's right edge, so a centred popup hung out over the
            content column. `align="end"` keeps it inside the nav and
            lines its edge up with the icon that opened it. */}
        <Popover.Positioner
          className={styles['positioner']}
          side="bottom"
          align="end"
          sideOffset={6}
        >
          <Popover.Popup className={styles['popup']}>
            <div className={styles['head']}>
              <span className={styles['title']}>Show lists</span>
              {/* Only when there is something to undo. A permanent "Show
                  all" beside an unfiltered view is a button that does
                  nothing, and the trigger already reads "All lists". */}
              {narrowed && (
                <button
                  type="button"
                  className={styles['clear']}
                  onClick={props.onClear}
                >
                  Show all
                </button>
              )}
            </div>
            <ul className={styles['lists']}>
              {props.lists.map((list) => {
                // Ticked means visible. The stored set names what is
                // *hidden* (list-filter.ts), so this is the inverse of
                // what is stored — stated here once rather than at each
                // use.
                const checked = !props.filter?.has(list.id)
                return (
                  <li key={list.id}>
                    <label className={styles['row']}>
                      <Checkbox.Root
                        checked={checked}
                        onCheckedChange={() => props.onToggle(list.id)}
                        className={styles['box']}
                        // Named explicitly, not by the wrapping <label>.
                        // Base UI renders a `<button role="checkbox">`,
                        // and a label wrapping a button does not name it
                        // the way it names a native input — verified in
                        // the browser, where all five boxes came back
                        // with a null accessible name.
                        // *(fixed 2026-08-05.)*
                        aria-label={`Show ${list.displayName}`}
                      >
                        <Checkbox.Indicator className={styles['indicator']}>
                          <LuCheck aria-hidden="true" size={12} />
                        </Checkbox.Indicator>
                      </Checkbox.Root>
                      {/* The list's own colour, so the popover reads like
                          the nav rather than an unrelated menu of names.
                          An uncoloured list gets the same empty ring the
                          nav gives it (docs/specs/lists.md — colours). */}
                      <span
                        className={cx(
                          styles['dot'],
                          list.color === undefined && styles['dotEmpty'],
                        )}
                        style={
                          list.color === undefined
                            ? undefined
                            : colourVar(list.color)
                        }
                        aria-hidden="true"
                      />
                      <span className={styles['name']}>{list.displayName}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
