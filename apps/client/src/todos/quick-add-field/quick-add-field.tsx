import {
  useLayoutEffect,
  useRef,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { caretOffset, placeCaret, tokensChanged } from '../lib/editable-caret'
import type { QuickAddToken } from '../lib/quick-add'
import styles from './quick-add-field.module.css'

/**
 * The longest a summary may be.
 *
 * A todo's summary is a *title*; prose belongs in the notes field below,
 * which is what that field is for. Without a bound the cost of every
 * keystroke grows with the text — the whole line is re-parsed and the
 * marks can be redrawn — which was measured at ~12ms per keystroke at
 * 4,000 characters on a fast machine, so several times that on an
 * ordinary one. 500 is far past any real todo and short enough that the
 * per-keystroke work stays flat.
 * *(added 2026-08-19, reported from use: holding ⌘V made typing crawl.)*
 */
const MAX_SUMMARY = 500

interface QuickAddFieldProps {
  value: string
  onChange: (value: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  /** Whether the field holds focus, so the caller can close its menus. */
  onFocusChange: (focused: boolean) => void
  placeholder: string
  tokens: readonly QuickAddToken[]
  /** Where a pill rewrite wants the caret, or null to leave it alone. */
  caretTo: RefObject<number | null>
  fieldRef: RefObject<HTMLDivElement | null>
}

/**
 * The line you type a todo into (docs/specs/quick-add.md — the field
 * wraps, and grows).
 *
 * A contenteditable rather than a form control, for one reason: the
 * recognised tokens are marked *inside* the text, and a padded mark is
 * only possible when the marks are real elements in the element you type
 * into. The `<input>` this replaced kept its marks in a shadow layer
 * underneath, which cannot pad a token without sliding that layer out of
 * register with the text above it — measured at 34px across three tokens
 * then, and 52px again against a wrapping `<textarea>`, because the fault
 * is the second layer rather than the tag.
 *
 * What that costs is spelled out in the spec and handled here: Enter,
 * paste, the caret and the undo stack are all this component's problem
 * now. It takes a string and calls back with a string, and knows nothing
 * about the grammar, the pills or the modal around it.
 */
export function QuickAddField(props: QuickAddFieldProps): ReactNode {
  const { value, tokens, caretTo, fieldRef } = props
  // What the DOM currently shows, so the next render can ask whether the
  // marks it holds are still the right ones.
  const drawn = useRef<{ text: string; tokens: readonly QuickAddToken[] }>({
    text: '',
    tokens: [],
  })
  const composing = useRef(false)

  // Draw the marks — and, crucially, *don't* when nothing needs drawing.
  //
  // Writing `innerHTML` empties the browser's undo stack (measured
  // 2026-08-19), so the one rule that keeps ⌘Z native is to touch the DOM
  // only when the token set actually changed. Ordinary typing moves no
  // token, so this returns early for the great majority of keystrokes and
  // the browser's own editing is left completely alone.
  //
  // A layout effect, not an event handler: the marks must be right for
  // *any* way the text changed — a pill rewrite and the reset on reopen
  // as much as a keystroke — and they must land before paint or the mark
  // visibly lags the character by a frame.
  useLayoutEffect(() => {
    const el = fieldRef.current
    if (!el) return

    // Never rewrite the DOM mid-composition. An IME holds uncommitted
    // text in the element while it is being composed, and replacing it
    // cancels the composition — the classic contenteditable bug on
    // Japanese, Chinese and Korean keyboards, and on Android autocorrect.
    if (composing.current) return

    const requested = caretTo.current
    const marksStillRight = !tokensChanged(
      drawn.current.tokens,
      tokens,
      drawn.current.text,
      value,
    )
    // The browser already put the typed character in the DOM, so when the
    // marks are unchanged there is nothing left to do — and doing nothing
    // is the whole point: no `innerHTML`, no lost undo. This is the path
    // almost every keystroke takes.
    //
    // `marksAreDrawnCorrectly` asks the DOM rather than trusting the
    // token comparison, because the browser edits inside these spans: type
    // at the end of a mark and it *extends* that span, so `p2` becomes
    // `p2 zzz` while the token still says `p2` at the same offsets. The
    // comparison sees no change and skips the redraw that would fix it.
    // Checking what is actually drawn cannot drift that way.
    // *(fixed 2026-08-19, reported from use: a mark swallowed the rest of
    // the line.)*
    if (
      readText(el) === value &&
      marksStillRight &&
      marksAreDrawnCorrectly(el, value, tokens)
    ) {
      drawn.current = { text: value, tokens }
      // Still honour a caret a pill asked for: replacing a token with an
      // identical one — picking the list that is already chosen — changes
      // neither text nor marks, and the caret still has to move.
      if (requested !== null) {
        caretTo.current = null
        el.focus()
        placeCaret(el, requested)
      }
      return
    }

    const at = requested ?? caretOffset(el)
    el.innerHTML = markup(value, tokens)
    drawn.current = { text: value, tokens }
    caretTo.current = null
    if (at === null) return

    // A caret a pill *asked* for is placed whether or not the field holds
    // focus at this instant. The menu that made the request is still
    // closing and takes focus back for a frame after calling `.focus()`,
    // so gating this on `document.activeElement` dropped the caret to the
    // start of the line and the next character typed landed there.
    // Otherwise only restore a caret we are re-rendering under, since
    // moving the selection into an unfocused field would steal it.
    // *(fixed 2026-08-19, found in the browser.)*
    if (requested !== null) {
      el.focus()
      placeCaret(el, at)
    } else if (document.activeElement === el) {
      placeCaret(el, at)
    }
  }, [value, tokens, caretTo, fieldRef])

  // Focus on mount, which is what the `<input>`'s `autoFocus` did for free.
  //
  // React's `autoFocus` is a form-control attribute and does nothing on a
  // contenteditable, so without this the modal opened with focus still on
  // the button that opened it and the first thing typed went nowhere.
  // A layout effect, so focus lands before paint rather than a frame after
  // the field appears. *(added 2026-08-19, found in the browser.)*
  useLayoutEffect(() => {
    fieldRef.current?.focus()
  }, [fieldRef])

  // Tell the caller whether this field holds focus, so it can close the
  // autocomplete when it does not.
  //
  // Native `focusin`/`focusout` on the element rather than React's
  // `onFocus`/`onBlur`: measured 2026-08-19, neither React's synthetic
  // handlers *nor* native `focus`/`blur` fire on this element at all,
  // though `document.activeElement` does move to it. `focusin`/`focusout`
  // bubble, which is what makes them survive whatever is swallowing the
  // non-bubbling pair.
  const { onFocusChange } = props
  useLayoutEffect(() => {
    const el = fieldRef.current
    if (!el) return undefined
    const gained = (): void => {
      onFocusChange(true)
    }
    const lost = (): void => {
      onFocusChange(false)
    }
    el.addEventListener('focusin', gained)
    el.addEventListener('focusout', lost)
    return () => {
      el.removeEventListener('focusin', gained)
      el.removeEventListener('focusout', lost)
    }
  }, [fieldRef, onFocusChange])

  // No newline may reach this field, by any route.
  //
  // `plaintext-only` and the modal's own Enter handling already cover the
  // two keys, so this is the backstop for everything else that can insert
  // a break — a dictation engine, an Android keyboard's newline, a
  // drag-and-drop. A native listener rather than React's `onBeforeInput`,
  // which is a legacy synthetic event that never fires for these input
  // types: verified in the browser 2026-08-19, where the React handler saw
  // nothing at all and was doing no work.
  useLayoutEffect(() => {
    const el = fieldRef.current
    if (!el) return undefined
    const block = (event: InputEvent): void => {
      if (
        event.inputType === 'insertParagraph' ||
        event.inputType === 'insertLineBreak'
      ) {
        event.preventDefault()
        return
      }
      // At the cap, refuse anything that would add to the text. Deleting,
      // and replacing a selection with something no longer, both stay
      // available — otherwise a full field could not be edited at all.
      const adds =
        event.inputType.startsWith('insert') ||
        event.inputType === 'insertFromPaste'
      if (!adds) return
      const selected = document.getSelection()?.toString().length ?? 0
      const incoming = event.data?.length ?? 0
      if (readText(el).length - selected + incoming > MAX_SUMMARY) {
        event.preventDefault()
      }
    }
    el.addEventListener('beforeinput', block)
    return () => {
      el.removeEventListener('beforeinput', block)
    }
  }, [fieldRef])

  return (
    <div
      ref={fieldRef}
      className={styles['field']}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label="Add a todo"
      data-placeholder={props.placeholder}
      spellCheck={false}
      autoCorrect="off"
      autoCapitalize="off"
      onInput={(event: FormEvent<HTMLDivElement>) => {
        props.onChange(readText(event.currentTarget))
      }}
      onCompositionStart={() => {
        composing.current = true
      }}
      onCompositionEnd={(event) => {
        composing.current = false
        // The committed text arrives with the composition ending rather
        // than through a further `input`, so read it here or the last
        // character of every composed word is lost.
        props.onChange(readText(event.currentTarget))
      }}
      onPaste={(event: ClipboardEvent<HTMLDivElement>) => {
        // A contenteditable pastes HTML by default, stylesheet and all.
        // Take the plain text and insert it through the browser so the
        // paste keeps its own place on the undo stack.
        event.preventDefault()
        const text = event.clipboardData.getData('text/plain')
        if (!text) return
        // Newlines would make a multi-line summary out of a paste when no
        // keystroke can, so they collapse to spaces.
        const flat = text.replace(/\s*\n+\s*/g, ' ')
        // Truncated to what will fit rather than refused: pasting a long
        // passage into a title is a mistake worth softening, and the first
        // 500 characters are the part that was wanted.
        const room = MAX_SUMMARY - readText(event.currentTarget).length
        if (room <= 0) return
        insertText(flat.slice(0, room))
      }}
      onKeyDown={props.onKeyDown}
    />
  )
}

/**
 * Do the spans in the DOM hold exactly the text the tokens name?
 *
 * The token comparison alone is not enough, because the browser edits
 * *inside* these spans. Typing at the trailing edge of a mark extends it —
 * `p2` becomes `p2 zzz` — while the token still reads `p2` at the same
 * offsets, so nothing in the comparison notices and the redraw that would
 * fix it never runs. Asking what is drawn is the check that cannot drift.
 *
 * Compares the marked strings in order, which is what the reader sees; the
 * exact node boundaries are the browser's business.
 */
function marksAreDrawnCorrectly(
  el: HTMLElement,
  value: string,
  tokens: readonly QuickAddToken[],
): boolean {
  const drawnMarks = [...el.querySelectorAll('span')]
  if (drawnMarks.length !== tokens.length) return false
  return tokens.every(
    (token, index) =>
      drawnMarks[index]?.textContent === value.slice(token.start, token.end),
  )
}

/**
 * The element's text, as a plain string.
 *
 * `textContent` rather than `innerText`: `innerText` is layout-aware, so
 * it reports the *rendered* text and appends a trailing newline in some
 * engines — which would feed a phantom character back into the value on
 * every keystroke. The marks are inline spans, so `textContent` already
 * reads exactly the characters that were typed. The `\n` guard covers a
 * break that survives `plaintext-only` on older engines.
 */
function readText(el: HTMLElement): string {
  return (el.textContent ?? '').replace(/\n/g, ' ')
}

/** `execCommand` is deprecated but is the only insert that keeps undo. */
function insertText(text: string): void {
  document.execCommand('insertText', false, text)
}

/**
 * The marks, as HTML.
 *
 * Built as a string rather than as React children because React does not
 * own this element's contents — the browser edits them directly, and a
 * React-rendered tree would be reconciled against a DOM the user has
 * already changed. This is the one place the app writes HTML by hand, so
 * every interpolation is escaped.
 */
function markup(text: string, tokens: readonly QuickAddToken[]): string {
  let html = ''
  let cursor = 0
  for (const token of tokens) {
    if (token.end <= cursor) continue
    const start = Math.max(token.start, cursor)
    if (start > cursor) html += escape(text.slice(cursor, start))
    html += `<span class="${styles['token'] ?? ''}">${escape(
      text.slice(start, token.end),
    )}</span>`
    cursor = token.end
  }
  return html + escape(text.slice(cursor))
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
