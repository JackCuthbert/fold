import { parseListColor } from '@fold/schemas'
import { useId, useState } from 'react'
import { LuCheck, LuX } from 'react-icons/lu'
import { cx } from '../../styles/cx'
import styles from './color-picker.module.css'

// docs/specs/lists.md — colours. The palette is a shortcut, not a
// constraint: the hex field is the truth, and a colour from another client
// renders exactly as stored even though it matches no swatch.
const PALETTE = [
  { name: 'Red', value: '#A8564A' },
  { name: 'Orange', value: '#B3703A' },
  { name: 'Amber', value: '#A8863C' },
  { name: 'Green', value: '#5D7F52' },
  { name: 'Teal', value: '#4A7F78' },
  { name: 'Blue', value: '#4A6F96' },
  { name: 'Violet', value: '#7A5F8F' },
  { name: 'Rose', value: '#9C5C72' },
] as const

/**
 * What typing a string into the hex field means.
 *
 * docs/specs/lists.md — colours. Three outcomes, not two: a half-typed hex
 * ("#1D9") is neither a colour nor a request to clear one, so it must leave
 * the stored colour alone. Folding "invalid" into "cleared" would wipe the
 * colour on the way to typing a valid one.
 */
export type ColorCommit =
  | { kind: 'set'; color: string }
  | { kind: 'cleared' }
  | { kind: 'incomplete' }

/** Pure half of the hex field's onChange — see `ColorCommit`. */
export function commitValue(raw: string): ColorCommit {
  const parsed = parseListColor(raw)
  if (parsed) return { kind: 'set', color: parsed }
  if (raw.trim() === '') return { kind: 'cleared' }
  return { kind: 'incomplete' }
}

/**
 * The default the native wheel opens on when no colour is set. --accent in
 * styles/tokens.css; a literal because the wheel takes a colour value, not
 * a CSS variable.
 */
const WHEEL_FALLBACK = '#7A5C3E'

interface ColorPickerProps {
  value: string | undefined
  onChange: (color: string | undefined) => void
}

export function ColorPicker(props: ColorPickerProps) {
  const hexId = useId()
  // Kept separate from `value` so a half-typed hex ("#1D9") doesn't clear
  // the colour on every keystroke.
  const [draft, setDraft] = useState(props.value ?? '')

  const commit = (raw: string): void => {
    setDraft(raw)
    const result = commitValue(raw)
    if (result.kind === 'set') props.onChange(result.color)
    else if (result.kind === 'cleared') props.onChange(undefined)
  }

  const select = (color: string | undefined): void => {
    props.onChange(color)
    setDraft(color ?? '')
  }

  return (
    <div className={styles['picker']}>
      <div className={styles['swatches']} role="group" aria-label="List colour">
        {/* Two elements, not one: the button is the 44px touch target (a
            usability floor — docs/specs/ui.md, controls & touch targets)
            and the span inside it is the smaller painted circle, so the
            palette fits one line without shrinking the target.
            *(split 2026-08-03.)* */}
        {PALETTE.map((entry) => (
          <button
            key={entry.value}
            type="button"
            className={styles['swatch']}
            aria-label={entry.name}
            aria-pressed={props.value === entry.value}
            onClick={() => select(entry.value)}
          >
            <span className={styles['dot']} style={{ background: entry.value }}>
              {props.value === entry.value && (
                <LuCheck aria-hidden="true" size={12} />
              )}
            </span>
          </button>
        ))}
        <button
          type="button"
          className={styles['swatch']}
          aria-label="No colour"
          aria-pressed={props.value === undefined}
          onClick={() => select(undefined)}
        >
          <span className={cx(styles['dot'], styles['none'])}>
            <LuX aria-hidden="true" size={12} />
          </span>
        </button>
      </div>

      <div className={styles['custom']}>
        <label className={styles['hexLabel']} htmlFor={hexId}>
          Custom
        </label>
        <input
          id={hexId}
          type="text"
          className={styles['hex']}
          placeholder={WHEEL_FALLBACK}
          value={draft}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => commit(event.target.value)}
        />
        {/* A native colour input costs nothing and gives a real wheel on
            every platform — worth far more than a hand-rolled one.
            Fed lowercase: the DOM normalizes `value` to lowercase, so
            handing it our uppercase `#RRGGBB` would make React's stored
            value and the DOM's disagree on every render. */}
        <input
          type="color"
          className={styles['wheel']}
          aria-label="Pick a colour"
          value={(props.value ?? WHEEL_FALLBACK).toLowerCase()}
          onChange={(event) => commit(event.target.value)}
        />
      </div>
    </div>
  )
}
