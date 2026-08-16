import type { Typeface } from '../theme'
import { TYPEFACES } from '../theme'
import styles from './typeface-choice.module.css'

export interface TypefaceChoiceProps {
  typeface: Typeface
  selected: boolean
  onSelect: (typeface: Typeface) => void
}

/**
 * One typeface, set in itself (docs/specs/themes.md).
 *
 * The font-manager convention — FontBook, Fonts on Windows — and the right
 * one here: a face is the only thing that can honestly show what it is, so
 * the name is set in the font it names.
 *
 * The name is set in the font, and beneath it one line saying what the face
 * is like to live with — **also set in that face**, so it is the specimen
 * as well as the explanation. Two jobs, one line.
 *
 * A pangram sat between them briefly and was removed: once the character
 * line existed the row carried two samples of the same font, and the
 * pangram was the one that said nothing. Kept to consequences rather than
 * adjectives — "takes more room" is the kind of thing you only learn a week
 * in, while calling a face "elegant" would be selling rather than
 * informing. It wraps rather than truncating, since half a sentence would
 * cut off the trade-off that decides the choice. *(changed 2026-08-10.)*
 *
 * *(added 2026-08-10.)*
 */
export function TypefaceChoice(props: TypefaceChoiceProps) {
  const face = TYPEFACES[props.typeface]
  return (
    <button
      type="button"
      className={styles['choice']}
      aria-pressed={props.selected}
      onClick={() => props.onSelect(props.typeface)}
      style={{ fontFamily: face.stack }}
    >
      <span className={styles['head']}>
        <span className={styles['name']}>{face.name}</span>
        {/* The note stays in the UI sans, not the face being shown: it is a
            label about the font rather than a sample of it. */}
        <span className={styles['note']}>{face.note}</span>
      </span>
      {/* aria-hidden: it is a picture of the letterforms, not text anyone
          needs read aloud — the name and note already say what this is. */}
      {/* Inherits the face from the button, so the sentence describing the
          font is itself set in it. Not `aria-hidden`: unlike a pangram this
          is real information, and someone who cannot see the letterforms
          still needs to know what they would be choosing. */}
      <span className={styles['character']}>{face.character}</span>
    </button>
  )
}
