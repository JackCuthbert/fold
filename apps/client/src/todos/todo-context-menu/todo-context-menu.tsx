import { ContextMenu } from '@base-ui/react/context-menu'
import type { Todo, TodoPriority } from '@fold/schemas'
import type { ReactNode } from 'react'
import {
  LuCalendarClock,
  LuCalendarDays,
  LuCalendarOff,
  LuCheck,
  LuChevronRight,
  LuCircle,
  LuCircleCheck,
  LuCoffee,
  LuFlag,
  LuFolderInput,
  LuSun,
  LuSunrise,
  LuSunset,
  LuTrash2,
} from 'react-icons/lu'
import { useTodoRowActions } from '../../shell/context/todo-actions-context'
import { PRIORITY_CHOICES } from '../lib/priority-choices'
import {
  daysUntilWeekday,
  formatScheduleTime,
  SATURDAY,
  scheduleIsNoop,
  SUNDAY,
  timeHasPassed,
  type ScheduleOffset,
} from '../lib/schedule'
import { cx } from '../../styles/cx'
import styles from './todo-context-menu.module.css'

/**
 * The radio value standing for "no priority".
 *
 * A sentinel because the group's value has to be comparable, and `null`
 * would make "nothing is selected" and "None is selected" the same state —
 * leaving an unprioritised todo with no item marked, which is the thing
 * the None choice exists to avoid. Never stored: it is mapped back to
 * `null` before it reaches a mutation.
 */
const NO_PRIORITY = 'none'

/**
 * The two times the menu offers, as `HH:mm`.
 *
 * 09:00 is the app's existing default — it is what the detail panel's Time
 * switch seeds (docs/specs/todos.md — due times) — so "Tomorrow 9:00 am"
 * reuses a convention rather than inventing one. 17:00 is its end-of-day
 * counterpart, for something that has to happen before the day is out.
 *
 * Not offered on the other day of the pair: "Today 9:00 am" is in the past
 * for most of a working day, and "Tomorrow 5:00 pm" is far enough off that
 * it is a date you would rather choose. *(added 2026-08-11.)*
 */
const START_OF_DAY = '09:00'
const END_OF_DAY = '17:00'

/**
 * A schedule row: the day, with the timed variant as a button beside it.
 *
 * The two used to be separate rows — "Tomorrow" and "Tomorrow 9:00 am" —
 * which read as four choices when there are really two days, each with an
 * optional time. Pairing them halves the submenu and puts the time where
 * it belongs, next to the day it modifies. *(changed 2026-08-17.)*
 *
 * **Returns a fragment, never a wrapper.** The popup is a two-column grid
 * and both items are its direct children; a `<div>` around them broke Base
 * UI's item walking outright, leaving focus stuck on the time button with
 * no arrow key able to leave it. The pairing is done by the grid, not by
 * nesting — which also means the time button is its own focus stop, so
 * ArrowRight reaches it and its label is announced.
 */
interface ScheduleRowProps {
  icon: ReactNode
  label: string
  /** Sets the date only, keeping whatever time the todo already had. */
  onSchedule: () => void
  disabled: boolean
  /** Omitted by the weekend rows, which offer no time. */
  timed?: {
    icon: ReactNode
    time: string
    onSchedule: () => void
    disabled: boolean
  }
}

function ScheduleRow(props: ScheduleRowProps): ReactNode {
  const timedLabel = props.timed
    ? `${props.label} at ${formatScheduleTime(props.timed.time)}`
    : ''
  return (
    <>
      <ContextMenu.Item
        className={cx(
          styles['item'],
          // Only a row that has a time beside it shares its grid line; a
          // weekend row spans both columns like any other item.
          props.timed ? styles['schedulePaired'] : undefined,
        )}
        disabled={props.disabled}
        onClick={props.onSchedule}
      >
        {props.icon}
        {props.label}
      </ContextMenu.Item>
      {props.timed ? (
        <ContextMenu.Item
          className={cx(
            styles['item'],
            styles['schedulePaired'],
            styles['scheduleTime'],
          )}
          disabled={props.timed.disabled}
          onClick={props.timed.onSchedule}
          // The icon alone is a sunset or a coffee cup, and neither says
          // "5pm" — the label carries the whole meaning. `title` gives the
          // pointer the same words the screen reader gets.
          aria-label={timedLabel}
          title={timedLabel}
        >
          {props.timed.icon}
        </ContextMenu.Item>
      ) : null}
    </>
  )
}

/**
 * Narrow the radio group's value back to a priority, or null.
 *
 * `onValueChange` hands over `any` — the group is untyped by design, since
 * it carries whatever its items declare. A guard rather than a cast, so an
 * unexpected value falls back to "no priority" instead of being written to
 * the server as a priority the schema does not have.
 */
function toPriority(value: unknown): TodoPriority | null {
  return value === 'high' || value === 'medium' || value === 'low'
    ? value
    : null
}

/**
 * The shared priority ink, by value.
 *
 * The choices themselves — label, glyph, order — come from
 * `todos/lib/priority-choices`, so the menu, both dropdowns and the row
 * pill cannot drift. Only the ink is local, because a CSS Module's class
 * names are per-file: `composes` pulls the colour from
 * `styles/priority.module.css`, still the one place it is defined.
 */
const PRIORITY_TONE: Record<string, string | undefined> = {
  high: styles['high'],
  medium: styles['medium'],
  low: styles['low'],
}

interface TodoContextMenuProps {
  todo: Todo
  /** The row's own classes — the trigger *becomes* the `<li>`. */
  className: string
  /** The row's contents. */
  children: ReactNode
}

/**
 * Right-click (or long-press) a todo row for its actions
 * (docs/specs/todos.md — row actions).
 *
 * Base UI's ContextMenu supplies both gestures: `onContextMenu` for a
 * pointer, and a long-press timer for touch that cancels if the finger
 * moves more than 10px — so scrolling a list never fires a menu. It also
 * sets `WebkitTouchCallout: 'none'`, which suppresses iOS's own text
 * callout that would otherwise appear over ours. None of that is worth
 * hand-rolling (docs/specs/ui.md — accessible primitives come from Base
 * UI).
 *
 * **The trigger renders the row's own `<li>`** rather than wrapping it.
 * Base UI's trigger is a `div` by default, which is not a valid child of a
 * `<ul>`; `render` makes it adopt the element instead of nesting inside
 * one. That also means `data-popup-open` lands on the row itself, which is
 * what the open-row background hangs off — no React state, and no
 * re-render of a list to show it (docs/specs/ui.md — the todo row).
 *
 * *(added 2026-08-11, issue #40.)*
 */
export function TodoContextMenu(props: TodoContextMenuProps) {
  const actions = useTodoRowActions()
  const { todo } = props
  const scheduled = todo.due !== undefined
  // Read at render rather than held in state: the menu is short-lived, and
  // a timer to flip this mid-hover would be machinery for a case nobody
  // meets. Re-opening the menu re-reads the clock.
  const endOfDayPassed = timeHasPassed(END_OF_DAY, new Date())
  // An option that would write back the value the todo already has is
  // disabled: "Today" on a todo already due today changed nothing, cost a
  // CalDAV round-trip, and read as a broken button. Note this compares the
  // whole `TodoDue`, so "Today 5pm" on a todo due today at 9am stays live
  // — only the genuinely pointless option goes quiet.
  const noop = (offset: ScheduleOffset, time?: string): boolean =>
    scheduleIsNoop(todo.due, new Date(), offset, time)
  // Read at render for the same reason as `endOfDayPassed`. On the day
  // itself these are 0, so "This Saturday" on a Saturday means today and
  // disables itself if the todo is already due then.
  const saturday = daysUntilWeekday(new Date(), SATURDAY)
  const sunday = daysUntilWeekday(new Date(), SUNDAY)

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger render={<li className={props.className} />}>
        {props.children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner className={cx(styles['positioner'])}>
          <ContextMenu.Popup className={cx(styles['popup'])}>
            {/* Same wording as the checkbox's own label, so the menu and
                the row describe one action the same way. */}
            <ContextMenu.Item
              className={cx(styles['item'])}
              onClick={() => actions.toggle(todo)}
            >
              {todo.completed ? (
                <LuCircle aria-hidden="true" size={14} />
              ) : (
                <LuCircleCheck aria-hidden="true" size={14} />
              )}
              {todo.completed ? 'Mark as active' : 'Mark as done'}
            </ContextMenu.Item>

            {/* docs/specs/todos.md — quick scheduling, behind a submenu.
                Flat, the two groups took six of the menu's ten rows for
                two questions most opens do not ask, and the whole thing
                had to be read to find Delete. A submenu costs one hover to
                the person who wants it and nothing to the person who
                doesn't. *(nested 2026-08-11.)*

                The same two icons the nav gives Today and Tomorrow, so a
                sun means the same thing everywhere in the app. */}
            <ContextMenu.SubmenuRoot>
              <ContextMenu.SubmenuTrigger className={cx(styles['item'])}>
                <LuCalendarClock aria-hidden="true" size={14} />
                <span>Schedule</span>
                <LuChevronRight
                  className={styles['submenuChevron']}
                  aria-hidden="true"
                  size={14}
                />
              </ContextMenu.SubmenuTrigger>
              <ContextMenu.Portal>
                <ContextMenu.Positioner
                  className={cx(styles['positioner'])}
                  // A submenu opens beside its trigger, not below it.
                  side="inline-end"
                  align="start"
                  sideOffset={2}
                >
                  <ContextMenu.Popup
                    className={cx(styles['popup'], styles['scheduleGrid'])}
                  >
                    {/* The row moves the date and keeps whatever time the
                        todo had; the button beside it sets the time too.
                        Both shapes earn their place — pulling a 9am meeting
                        forward should stay at 9am, while "deal with this
                        by tonight" is a time you are choosing.
                        *(timed pair added 2026-08-11; paired into one row
                        2026-08-17.)* */}
                    <ScheduleRow
                      icon={<LuSun aria-hidden="true" size={14} />}
                      label="Today"
                      onSchedule={() => actions.schedule(todo, 0)}
                      disabled={noop(0)}
                      timed={{
                        icon: <LuSunset aria-hidden="true" size={14} />,
                        time: END_OF_DAY,
                        onSchedule: () => actions.schedule(todo, 0, END_OF_DAY),
                        // Disabled once the hour has gone, rather than
                        // silently rolling to tomorrow or scheduling into
                        // the past. An instantly-overdue todo is worse
                        // than no shortcut. *(added 2026-08-11.)*
                        disabled: endOfDayPassed || noop(0, END_OF_DAY),
                      }}
                    />
                    <ScheduleRow
                      icon={<LuSunrise aria-hidden="true" size={14} />}
                      label="Tomorrow"
                      onSchedule={() => actions.schedule(todo, 1)}
                      disabled={noop(1)}
                      timed={{
                        icon: <LuCoffee aria-hidden="true" size={14} />,
                        time: START_OF_DAY,
                        onSchedule: () =>
                          actions.schedule(todo, 1, START_OF_DAY),
                        disabled: noop(1, START_OF_DAY),
                      }}
                    />

                    {/* The weekend, in its own group: "the next day or two"
                        and "when I next have time" are different questions,
                        and a divider says so without a heading.
                        *(added 2026-08-17.)*

                        No time offered. 9am on a Saturday is a working-week
                        habit, and picking one for a weekend day is a guess
                        the detail panel can make properly. */}
                    <ContextMenu.Separator
                      className={cx(styles['separator'])}
                    />
                    <ScheduleRow
                      icon={<LuCalendarDays aria-hidden="true" size={14} />}
                      label="This Saturday"
                      onSchedule={() => actions.schedule(todo, saturday)}
                      disabled={noop(saturday)}
                    />
                    <ScheduleRow
                      icon={<LuCalendarDays aria-hidden="true" size={14} />}
                      label="This Sunday"
                      onSchedule={() => actions.schedule(todo, sunday)}
                      disabled={noop(sunday)}
                    />
                    <ContextMenu.Separator
                      className={cx(styles['separator'])}
                    />
                    {/* Disabled rather than absent on an undated todo, so
                        the menu keeps one shape wherever you open it — the
                        same reasoning as Move up/Move down in the list
                        kebab. */}
                    <ContextMenu.Item
                      className={cx(styles['item'])}
                      disabled={!scheduled}
                      onClick={() => actions.unschedule(todo)}
                    >
                      <LuCalendarOff aria-hidden="true" size={14} />
                      Clear due date
                    </ContextMenu.Item>
                  </ContextMenu.Popup>
                </ContextMenu.Positioner>
              </ContextMenu.Portal>
            </ContextMenu.SubmenuRoot>

            {/* docs/specs/todos.md — row actions. A radio group, since
                these are four answers to one question and exactly one is
                always true; Base UI gives the items `menuitemradio` and
                keeps the checked state in sync with the value, so the
                accessible state and the styling read from one source.

                The trigger is a plain label, like Schedule's. It briefly
                carried the current value ("Priority   High") so nesting
                would not hide it — but the value's width varies with the
                word, so the row's chevron moved as the priority changed,
                and it read as clutter on a menu whose whole point was to
                get shorter. The row already shows its priority as a pill;
                the tick inside the submenu is where the answer belongs.
                *(removed 2026-08-11.)* */}
            <ContextMenu.SubmenuRoot>
              <ContextMenu.SubmenuTrigger className={cx(styles['item'])}>
                <LuFlag aria-hidden="true" size={14} />
                <span>Priority</span>
                <LuChevronRight
                  className={styles['submenuChevron']}
                  aria-hidden="true"
                  size={14}
                />
              </ContextMenu.SubmenuTrigger>
              <ContextMenu.Portal>
                <ContextMenu.Positioner
                  className={cx(styles['positioner'])}
                  side="inline-end"
                  align="start"
                  sideOffset={2}
                >
                  <ContextMenu.Popup className={cx(styles['popup'])}>
                    <ContextMenu.RadioGroup
                      value={todo.priority ?? NO_PRIORITY}
                      onValueChange={(value) => {
                        actions.setPriority(todo, toPriority(value))
                      }}
                    >
                      {PRIORITY_CHOICES.map((choice) => (
                        <ContextMenu.RadioItem
                          key={choice.label}
                          className={cx(styles['item'])}
                          value={choice.value ?? NO_PRIORITY}
                        >
                          {/* Colour on the icon and the label together,
                              from the shared priority ink — so the item
                              looks like the pill it will produce. */}
                          <span
                            className={cx(
                              styles['radioLabel'],
                              PRIORITY_TONE[choice.value ?? NO_PRIORITY],
                            )}
                          >
                            <span className={styles['radioIcon']}>
                              {choice.icon}
                            </span>
                            {choice.label}
                          </span>
                          {/* The tick trails the label rather than leading
                              it: the leading column already holds the rank
                              glyph, and a tick beside it put two marks on
                              one row for two different jobs. On the right
                              it reads as the answer to "which one is set?"
                              without competing with the icon that says
                              which one this is.

                              Still `keepMounted`, so the column is
                              reserved on every row and the labels do not
                              shift as the value moves. */}
                          <ContextMenu.RadioItemIndicator
                            className={cx(styles['radioIndicator'])}
                            keepMounted
                          >
                            <LuCheck aria-hidden="true" size={12} />
                          </ContextMenu.RadioItemIndicator>
                        </ContextMenu.RadioItem>
                      ))}
                    </ContextMenu.RadioGroup>
                  </ContextMenu.Popup>
                </ContextMenu.Positioner>
              </ContextMenu.Portal>
            </ContextMenu.SubmenuRoot>

            <ContextMenu.Separator className={cx(styles['separator'])} />

            {/* Both of these only *ask*: the dialogs they need are owned by
                MainScreen, because a dialog nested inside this menu would
                render without a backdrop (issue #38, issue #50). See
                shell/context/todo-actions-context.tsx. */}
            <ContextMenu.Item
              className={cx(styles['item'])}
              onClick={() => actions.requestMove(todo)}
            >
              <LuFolderInput aria-hidden="true" size={14} />
              Move to…
            </ContextMenu.Item>
            <ContextMenu.Item
              className={cx(styles['item'], styles['destructive'])}
              onClick={() => actions.requestDelete(todo)}
            >
              <LuTrash2 aria-hidden="true" size={14} />
              Delete
            </ContextMenu.Item>
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}
