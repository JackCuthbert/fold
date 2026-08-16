import type { TodoList, TodoPriority } from '@fold/schemas'
import { cx } from '../../styles/cx'
import { formatDay, formatTime } from '../lib/quick-add-labels'
import { PRIORITY_CHOICES, priorityChoice } from '../lib/priority-choices'
import type { QuickAddResult, QuickAddToken } from '../lib/quick-add'
import {
  PillMenu,
  PillPicker,
  PRIORITY_PILL_CLASS,
} from '../quick-add-pills/quick-add-pills'
import styles from '../quick-add-modal/quick-add-modal.module.css'

// docs/specs/quick-add.md — the interpretation line.
//
// What the typed line was understood to mean, said back as pills: the
// list, the date, the time and the priority. The pills are *controls* —
// choosing from one rewrites the text, and the parse follows from the
// text — so this owns the row's arrangement and hands each pill what to
// do, while the pills themselves know nothing about the grammar.
//
// Shares the modal's stylesheet: this is the modal's own preview row, and
// a second stylesheet would put the same tokens in two places.
// *(extracted 2026-08-15 from quick-add-modal.tsx.)*

interface PreviewProps {
  parsed: QuickAddResult
  list: TodoList | undefined
  /** Every list, for the list pill's menu. */
  lists: readonly TodoList[]
  noDueDates: boolean
  /** Why due dates are off, when they are (docs/specs/list-kinds.md). */
  /**
   * The list's name when its kind has no due dates, so the disabled date
   * pill can name it (docs/specs/list-kinds.md). `undefined` otherwise.
   */
  dueDatesOffList: string | undefined
  now: Date
  /** There is text, but nowhere to file it — see the branch below. */
  needsList: boolean
  /** Rewrite the date half of the due token; `''` clears it. */
  onSetDate: (date: string, token: QuickAddToken | undefined) => void
  /** Rewrite the time half; `''` returns the todo to all-day. */
  onSetTime: (time: string, token: QuickAddToken | undefined) => void
  /** Rewrite the `#list` token, or add one when there is none. */
  onSetList: (list: TodoList, token: QuickAddToken | undefined) => void
  /** Rewrite the `pN` token; `null` clears the priority. */
  onSetPriority: (
    priority: TodoPriority | null,
    token: QuickAddToken | undefined,
  ) => void
}

/**
 * What will be created, in the row's own pill vocabulary
 * (docs/specs/ui.md — two pill treatments) so the preview and the result
 * look like the same thing rather than two descriptions of it.
 */
export function Preview(props: PreviewProps) {
  const { parsed } = props
  const priority = parsed.priority ? priorityChoice(parsed.priority) : null

  // No "nothing parsed yet" branch any more: the pills are always drawn,
  // so the row is never empty and there is nothing to fill it with.
  // *(removed 2026-08-14, when the pills became the discoverable path.)*

  const listToken = parsed.tokens.find((token) => token.kind === 'list')
  const priorityToken = parsed.tokens.find((token) => token.kind === 'priority')

  const dueToken = parsed.tokens.find((token) => token.kind === 'date')

  return (
    <div className={styles['preview']}>
      {/* **Every pill is always here**, set or not. An unset one reads
          "Due" / "List" / "Priority" in the placeholder treatment and opens
          the same menu as a set one.

          This is what makes the syntax optional rather than required: the
          grammar is the fast path for someone who knows it, and the pills
          are the complete path for someone who does not. Drawing them only
          once a token had been typed meant you had to already know `p1`
          existed to discover that priority could be set at all.
          *(changed 2026-08-14: pills appeared only when parsed.)*

          **Ordered list, date, time, priority** — widest scope first.
          Where a todo lives outranks when it is due, which outranks the
          hour within that day, which outranks how much it matters; and the
          time pill sits beside the date it depends on. It is also the
          order of how often each is answered, so the eye meets the common
          decisions first. *(ordered 2026-08-14.)* */}
      {/* On a derived view there is no list to default to, so this pill is
          the only way to say where the todo goes. It marks itself rather
          than a hint replacing the whole row: an earlier cut swapped the
          pills for the sentence "Add #list to choose where this goes",
          which hid the control that answers it at the moment you need it.

          **Marked only once you try to submit**, not while typing. Keyed on
          text alone it lit up on the first keystroke and stayed lit, so it
          read as an error the whole time you were writing a perfectly good
          todo — nagging, which is the one thing this app does not do
          (docs/specs/overview.md — product intent). Now it waits until
          Enter has been pressed and could not be honoured.
          *(changed 2026-08-14, found in review.)* */}
      <PillMenu
        label={props.list?.displayName ?? 'List'}
        unset={!props.list}
        className={cx(
          styles['pillList'],
          props.needsList && styles['pillNeeded'],
        )}
        {...(props.list
          ? {
              before: (
                <span
                  className={cx(
                    styles['dot'],
                    props.list.color === undefined && styles['dotEmpty'],
                  )}
                  {...(props.list.color === undefined
                    ? {}
                    : { style: { background: props.list.color } })}
                  aria-hidden="true"
                />
              ),
            }
          : {})}
        title={
          props.list
            ? `List: ${props.list.displayName}. Choose another.`
            : 'Choose a list'
        }
        items={props.lists.map((entry) => ({
          key: entry.id,
          label: entry.displayName,
          // The list's own dot, as everywhere else a list is named
          // (docs/specs/lists.md — wherever a list is named). Without it
          // this menu was the one list picker in the app showing bare
          // names, so the colour you recognise a list by was missing at
          // the moment of choosing one. *(added 2026-08-14.)*
          icon: (
            <span
              className={cx(
                styles['dot'],
                entry.color === undefined && styles['dotEmpty'],
              )}
              {...(entry.color === undefined
                ? {}
                : { style: { background: entry.color } })}
              aria-hidden="true"
            />
          ),
          selected: entry.id === props.list?.id,
          onPick: () => props.onSetList(entry, listToken),
        }))}
      />
      {/* Date and time are **two pills with two pickers**, matching the
          edit form's two fields (due-controls.tsx) rather than offering a
          menu of canned days.

          A fixed list — Today / Tomorrow / This weekend / Next week —
          could only ever cover the days someone thought of in advance, so
          the moment you wanted the 25th it had nothing to say and you were
          back to typing. A picker answers every date, and the two are
          split because a time is a separate decision: most todos are
          all-day, and a date picker that always dragged a time along would
          make "no particular hour" the awkward case.
          *(changed 2026-08-14: was a menu of canned choices.)* */}
      <PillPicker
        label={parsed.due ? formatDay(parsed.due.date, props.now) : 'Date'}
        unset={!parsed.due}
        className={cx(props.noDueDates && styles['pillDropped'])}
        type="date"
        value={parsed.due?.date ?? ''}
        title={
          props.noDueDates
            ? 'Due dates are off for this list'
            : parsed.due
              ? 'Change the date'
              : 'Set a date'
        }
        disabled={props.noDueDates}
        // The kind's own description, not a sentence written here: it is
        // the same prose the nav badge and the detail panel show, so the
        // reason a date is unavailable reads identically everywhere it is
        // explained (lists/lib/list-kind.ts).
        {...(props.dueDatesOffList
          ? { disabledListName: props.dueDatesOffList }
          : {})}
        onChange={(value) => props.onSetDate(value, dueToken)}
      />
      {/* The time pill appears only once there is a date, because a time
          without one is not expressible in DUE (docs/specs/todos.md — due
          times). That is the same nesting the edit form uses: its Time
          switch does not exist until a date is set. */}
      {parsed.due && (
        <PillPicker
          label={parsed.due.time === '' ? 'Time' : formatTime(parsed.due.time)}
          unset={parsed.due.time === ''}
          className={cx(props.noDueDates && styles['pillDropped'])}
          type="time"
          value={parsed.due.time}
          title={parsed.due.time === '' ? 'Set a time' : 'Change the time'}
          onChange={(value) => props.onSetTime(value, dueToken)}
        />
      )}
      <PillMenu
        label={priority?.label ?? 'Priority'}
        unset={!priority}
        className={cx(
          parsed.priority && styles[PRIORITY_PILL_CLASS[parsed.priority]],
        )}
        {...(priority ? { before: priority.icon } : {})}
        title={
          priority
            ? `Priority: ${priority.label}. Choose another.`
            : 'Set a priority'
        }
        items={PRIORITY_CHOICES.map((choice) => ({
          key: choice.value ?? 'none',
          label: choice.label,
          // The glyph in its rank's tinted box, exactly as the row's
          // context menu draws the same choices
          // (todo-context-menu.module.css — `.radioIcon`). Passing the
          // bare glyph left every option in plain ink, so the menu that
          // *sets* a priority was the one place not showing its colour.
          // *(fixed 2026-08-14, found in review.)*
          icon: (
            <span
              className={cx(
                styles['prioSwatch'],
                choice.value !== null &&
                  styles[PRIORITY_PILL_CLASS[choice.value]],
              )}
            >
              {choice.icon}
            </span>
          ),
          selected: choice.value === parsed.priority,
          onPick: () => props.onSetPriority(choice.value, priorityToken),
        }))}
      />
    </div>
  )
}

/** Which colour class a rank's pill takes — see the stylesheet. */
