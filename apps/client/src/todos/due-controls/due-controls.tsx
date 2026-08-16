import { Field } from '@base-ui/react/field'
import { Input } from '@base-ui/react/input'
import { Switch } from '@base-ui/react/switch'
import type { Ref } from 'react'
import { cx } from '../../styles/cx'
import { todayDateValue } from '../lib/due-fields'
import styles from './due-controls.module.css'

export interface DueControlsProps {
  /** `yyyy-mm-dd`, or `''` for "no due date". */
  date: string
  /** `HH:mm`, or `''` for "all day". */
  time: string
  onDateChange: (value: string) => void
  onTimeChange: (value: string) => void
  onDateBlur?: () => void
  onTimeBlur?: () => void
  dateRef?: Ref<HTMLInputElement>
  timeRef?: Ref<HTMLInputElement>
  /** Validation message for the time field, if the form has one. */
  error?: string | undefined
  /** Every field is read-only — a completed todo that hasn't been unlocked. */
  disabled?: boolean
}

/**
 * "Due date" and "Time" as switches that reveal their pickers.
 *
 * docs/specs/todos.md — due times. Modelled on Apple Reminders, and chosen
 * over a pair of "No date" / "No time" buttons because it solves the
 * problem those buttons only work around: before this there was **no way
 * to clear a due date once set**. A native date input offers no empty
 * state of its own — clearing it is a per-platform gesture, and on iOS
 * there isn't one at all — so a date set by mistake was permanent.
 *
 * Switching off *is* the unset, which also means the pickers are absent
 * entirely for the todos that have no due date. That is the common case,
 * and it keeps the platform's widest, least controllable control off the
 * screen unless it is actually wanted.
 *
 * The switches hold **no state of their own**: "on" is derived from the
 * value being non-empty. One source of truth, so `reset`/`revert` restore
 * the switches along with the values, and a switch can never disagree
 * with the field beneath it.
 *
 * The nesting is the invariant made visible: the time switch only exists
 * while a date is set, so "a time with no date" — which DUE cannot
 * express and the schema rejects — is unreachable rather than merely
 * validated.
 *
 * Deliberately **presentational**: plain values and callbacks, no
 * `Control`. Both callers' forms carry different field sets, and a shared
 * component typed over `Control<T>` cannot name `due`/`dueTime` without an
 * assertion to `never` (`Path<T>` will not accept a literal from a mere
 * constraint), while narrowing to a two-field `Control` fails because
 * `Control` is invariant. Either route needs an unsound cast; passing
 * values does not. The callers keep their own `Controller`s, where the
 * field names are concrete and check for free. *(added 2026-08-08.)*
 */
export function DueControls(props: DueControlsProps) {
  const disabled = props.disabled ?? false
  const hasDate = props.date !== ''
  const hasTime = props.time !== ''

  return (
    <div className={styles['group']}>
      {/* One label per field. The switch and the picker it reveals are the
          same field — "Due date" above a second "Date" label said the same
          thing twice. The switch's label *is* the field's label, and the
          picker below it inherits that meaning from position.
          *(changed 2026-08-08.)* */}
      <Field.Root className={styles['toggleRow']} disabled={disabled}>
        <Field.Label className={styles['toggleLabel']}>Date</Field.Label>
        <Switch.Root
          className={styles['switch']}
          checked={hasDate}
          disabled={disabled}
          // On: seed today rather than opening an empty picker. A date is
          // being *added*, so the likely answer is a real date, and an
          // empty required field would be an error state the user did not
          // cause.
          //
          // Off: clear the time as well, or an orphaned `dueTime` survives
          // with its input unmounted — invisible, and failing the schema's
          // "a time needs a date" refine with an error nobody can see or
          // reach.
          onCheckedChange={(next) => {
            props.onDateChange(next ? todayDateValue() : '')
            if (!next) props.onTimeChange('')
          }}
        >
          <Switch.Thumb className={styles['thumb']} />
        </Switch.Root>
      </Field.Root>

      {hasDate && (
        <div className={styles['pickers']}>
          <Field.Root
            className={cx(styles['field'], styles['dueDate'])}
            disabled={disabled}
          >
            {/* No visible label — the switch above is this field's label.
                `aria-label` keeps it named for screen readers, which get
                no help from adjacency. */}
            <Input
              ref={props.dateRef}
              type="date"
              aria-label="Date"
              value={props.date}
              onBlur={props.onDateBlur}
              onValueChange={props.onDateChange}
            />
          </Field.Root>

          <div className={styles['timeGroup']}>
            <Field.Root className={styles['toggleRow']} disabled={disabled}>
              <Field.Label className={styles['toggleLabel']}>Time</Field.Label>
              <Switch.Root
                className={styles['switch']}
                checked={hasTime}
                disabled={disabled}
                // 9:00 rather than the current time: a due *time* is a
                // deadline someone chose, and the minute you happened to
                // flick the switch is never that. A round hour reads as a
                // placeholder to adjust; 14:37 looks deliberate.
                onCheckedChange={(next) =>
                  props.onTimeChange(next ? '09:00' : '')
                }
              >
                <Switch.Thumb className={styles['thumb']} />
              </Switch.Root>
            </Field.Root>

            {hasTime && (
              <Field.Root
                className={cx(styles['field'], styles['dueTime'])}
                disabled={disabled}
              >
                <Input
                  ref={props.timeRef}
                  type="time"
                  aria-label="Time"
                  value={props.time}
                  onBlur={props.onTimeBlur}
                  onValueChange={props.onTimeChange}
                />
                {props.error !== undefined && (
                  <Field.Error className={styles['error']} match>
                    {props.error}
                  </Field.Error>
                )}
              </Field.Root>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
