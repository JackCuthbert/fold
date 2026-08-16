import { Menu } from '@base-ui/react/menu'
import type { TodoPriority } from '@fold/schemas'
import { Popover } from '@base-ui/react/popover'
import type { ReactNode } from 'react'
import { LuCheck, LuChevronDown } from 'react-icons/lu'
import { cx } from '../../styles/cx'
import styles from '../quick-add-modal/quick-add-modal.module.css'

// docs/specs/quick-add.md — the preview pills are controls.
//
// The two pill *kinds*, lifted out of the modal that hosts them: a picker
// wrapping a native date/time input, and a menu for the list and priority.
// Both are generic over what they show — the modal supplies the label, the
// items and what to do when one is chosen — so nothing here knows about
// quick add's grammar.
//
// They share the modal's stylesheet rather than owning one: these are
// *its* pills, sized and coloured to sit in its preview row, and a second
// stylesheet would put the same tokens in two places.
// *(extracted 2026-08-15 from quick-add-modal.tsx, which had reached 1257
// lines — CLAUDE.md's soft ceiling is ~300.)*

export const PRIORITY_PILL_CLASS: Record<TodoPriority, string> = {
  high: 'pillHigh',
  medium: 'pillMedium',
  low: 'pillLow',
}

interface PillPickerProps {
  label: string
  unset: boolean
  className: string | undefined
  type: 'date' | 'time'
  /** `yyyy-mm-dd` or `HH:mm`; `''` when unset. */
  value: string
  title: string
  /**
   * The chosen list has no due dates (docs/specs/list-kinds.md), so this
   * pill cannot be set. Genuinely disabled, not merely dimmed: the value
   * would be discarded on submit, and a control that accepts input it
   * then throws away is worse than one that refuses it.
   */
  disabled?: boolean
  /**
   * The recognised list responsible for the pill being disabled. Its name
   * is woven into the sentence shown on hover or tap.
   */
  disabledListName?: string
  onChange: (value: string) => void
}

/**
 * A pill that *is* a native date or time input
 * (docs/specs/quick-add.md — the pills edit the text).
 *
 * The input is stretched invisibly across the pill rather than shown, so
 * the pill keeps the row's vocabulary while a tap opens the platform's own
 * picker — the same control the edit form uses (due-controls.tsx), which
 * on iOS is the wheel everyone already knows. Building a calendar inside a
 * launcher would be a second date UI to learn and to maintain.
 *
 * The label is what you read; the input is what you touch.
 */
export function PillPicker(props: PillPickerProps) {
  const className = cx(
    styles['pill'],
    styles['pillButton'],
    styles['pillPicker'],
    props.unset && styles['pillUnset'],
    props.disabled && styles['pillDisabled'],
    props.className,
  )

  // Disabled: the pill becomes its own explanation rather than an inert
  // shape. A control that refuses input has to say why — the strike-through
  // shows *that* it is unavailable, and this says *why*, without which the
  // list-kind rule is invisible unless you already know it.
  //
  // A popover rather than `title`: a disabled input swallows the pointer
  // events a native tooltip needs, and `title` never appears on touch at
  // all — so the explanation would be missing exactly where the affordance
  // is least discoverable. Same reasoning as InfoBadge (ui/info-badge).
  // *(added 2026-08-14, on review.)*
  if (props.disabled) {
    return (
      <Popover.Root>
        <Popover.Trigger
          className={className}
          aria-label={props.title}
          openOnHover
          delay={200}
          render={<button type="button" />}
        >
          {props.label}
        </Popover.Trigger>
        <Popover.Portal>
          {/* `menuPositioner`, the same one the keyboard-help popover and
              the pill menus use: it carries the z-index that clears this
              modal's own popup. A portalled layer lands on document.body,
              outside the modal's stacking context, so without it the
              popover paints *under* the scrim
              (docs/specs/ui.md — overlays). */}
          <Popover.Positioner
            className={styles['menuPositioner']}
            sideOffset={6}
          >
            <Popover.Popup className={styles['helpPopup']}>
              <strong>{props.disabledListName}</strong> is a{' '}
              <em>recognised list</em> and does not use due dates. Set a
              priority instead to say what is next, or choose a list that uses
              dates.
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    )
  }

  return (
    <span className={className} title={props.title}>
      {props.label}
      <LuChevronDown className={styles['pillChevron']} size={12} />
      <input
        type={props.type}
        className={styles['pillPickerInput']}
        value={props.value}
        aria-label={props.title}
        // Open the picker explicitly rather than relying on the click
        // landing somewhere the browser treats as its own affordance.
        //
        // The input is stretched invisibly over the pill, and the CSS
        // stretches `::-webkit-calendar-picker-indicator` over it too — but
        // that only opens a **date** picker, and only in Chrome. A `time`
        // input has no such indicator to stretch, so the time pill did
        // nothing at all when clicked, and the date pill only responded
        // where the indicator happened to be. Both read as broken controls.
        //
        // `showPicker` is the supported way to ask, and it must be called
        // from a user gesture — which a click handler is. Guarded because
        // Firefox omits it on `time`, where clicking a focused field opens
        // the picker anyway. *(fixed 2026-08-15, found in use.)*
        onClick={(event) => {
          const field = event.currentTarget
          if (typeof field.showPicker !== 'function') return
          try {
            field.showPicker()
          } catch {
            // Throws if the browser judges the gesture untrusted. The
            // field is focused either way, so the keyboard still works.
          }
        }}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </span>
  )
}

interface PillMenuItem {
  key: string
  label: string
  icon?: ReactNode
  selected: boolean
  onPick: () => void
}

interface PillMenuProps {
  label: string
  /**
   * `string | undefined` because a CSS Modules lookup is typed that way
   * under `noUncheckedIndexedAccess`, and `cx` already drops falsy values.
   */
  className: string | undefined
  before?: ReactNode
  /**
   * Nothing has been parsed for this pill yet, so it shows its category
   * name ("Due") in the placeholder treatment rather than a value.
   */
  unset?: boolean
  /** The accessible name — the pill's text alone would not say it opens. */
  title: string
  items: PillMenuItem[]
}

/**
 * A preview pill that opens a menu, and whose choice **rewrites the text**
 * (docs/specs/quick-add.md — the pills edit the text).
 *
 * This is the point that keeps one source of truth: picking "Work" does not
 * store a list beside the text, it edits `#chores` into `#Work` and lets the
 * parse follow. So a pointer and the keyboard drive the same thing, and
 * there is no state that can disagree with what is written.
 *
 * The read-only version shipped first and the spec argued *against* chips
 * on two-sources-of-truth grounds. That argument was about chips that hold
 * their own value; it does not apply to a control that edits the text.
 * *(changed 2026-08-14.)*
 */
export function PillMenu(props: PillMenuProps) {
  return (
    <Menu.Root>
      <Menu.Trigger
        className={cx(
          styles['pill'],
          styles['pillButton'],
          props.unset && styles['pillUnset'],
          props.className,
        )}
        // `aria-label` as well as `title`: the visible text is the *value*
        // ("Chores"), which does not say which control it belongs to. A
        // title alone is a tooltip — it does not name the button for a
        // screen reader, and an assistive user hears "Chores, button" with
        // no clue it sets the list. *(added 2026-08-14.)*
        aria-label={props.title}
        title={props.title}
      >
        {props.before}
        {props.label}
        <LuChevronDown className={styles['pillChevron']} size={12} />
      </Menu.Trigger>
      <Menu.Portal>
        {/* Below the pill and aligned to its leading edge, so the menu
            hangs off the control that opened it rather than being centred
            under it — the pills sit in a row, and a centred popup reads as
            belonging to whichever pill it happens to overlap. */}
        <Menu.Positioner
          className={styles['menuPositioner']}
          side="bottom"
          align="start"
          sideOffset={4}
        >
          <Menu.Popup className={styles['menuPopup']}>
            {props.items.map((item) => (
              <Menu.Item
                key={item.key}
                className={cx(
                  styles['menuItem'],
                  item.selected && styles['menuItemSelected'],
                )}
                onClick={item.onPick}
              >
                {item.icon}
                {item.label}
                {/* Which one is set. Weight alone was the first cut and is
                    not readable against a single row — and this menu is
                    often opened to *check* the value rather than change
                    it. `aria-hidden` because the row already carries the
                    state for a screen reader (Base UI marks it).
                    *(added 2026-08-14, found in review.)* */}
                {item.selected && (
                  <LuCheck
                    className={styles['menuTick']}
                    size={14}
                    aria-hidden="true"
                  />
                )}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
