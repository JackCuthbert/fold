import { Dialog } from '@base-ui/react/dialog'
import { Popover } from '@base-ui/react/popover'
import type { NewTodo, TodoList, TodoPriority } from '@fold/schemas'
import Fuse from 'fuse.js'
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react'
import { LuCircleHelp, LuPlus } from 'react-icons/lu'
import { cx } from '../../styles/cx'
import { fieldsToDue } from '../lib/due-fields'
import { featuresOf, kindExplanation } from '../../lists/lib/list-kind'
import { caretRect } from '../lib/editable-caret'
import { QuickAddField } from '../quick-add-field/quick-add-field'
import { Preview } from '../quick-add-preview/quick-add-preview'
import {
  parseQuickAdd,
  replaceToken,
  type QuickAddToken,
} from '../lib/quick-add'
import styles from './quick-add-modal.module.css'

/** Stable identity, so the closed field's `tokens` prop does not change
 *  every render and re-run the field's draw effect. */
const EMPTY_TOKENS: readonly QuickAddToken[] = []

/** Matches `.inlineMenu`'s own `min-width`, for the fallback measurement. */
const MENU_MIN_WIDTH = 128

/** How close to the window's edge the autocomplete may sit. */
const MENU_VIEWPORT_MARGIN = 8

/**
 * Quick add (docs/specs/quick-add.md) — one field that creates a todo.
 *
 * A launcher rather than a form: the input, and a line under it echoing
 * what the text was understood to mean. There is no Add button, no
 * accordion, and no field per property, because the whole complaint this
 * answers is that a todo with a due date and a priority costs six
 * interactions to state in two seconds of typing.
 *
 * **The echo is read-only.** Editable chips were rejected in the spec: a
 * chip that can be changed independently of the text puts two sources of
 * truth on screen, and there is no pleasant rule for what happens when the
 * text says `tomorrow` and the chip says Friday. A mistake is corrected
 * where it was made.
 */
interface QuickAddModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  lists: readonly TodoList[]
  /** The list on screen, used when the text names none. */
  defaultListId?: string | undefined
  onAdd: (listId: string, todo: NewTodo) => void
  /**
   * Focus returns here on close. Explicit rather than left to Base UI's
   * fallback: creating a todo re-renders and reorders the list beneath,
   * and the heuristic then restores focus to whatever now occupies that
   * position rather than to the control that opened this.
   */
  triggerRef: RefObject<HTMLButtonElement | null>
}

export function QuickAddModal(props: QuickAddModalProps) {
  const [text, setText] = useState('')
  // Notes, the one thing the grammar deliberately does not cover — prose
  // does not belong on a line with tokens in it. Tab from the input
  // reaches it, and it stays collapsed until then so the common case is
  // still one field. *(added 2026-08-14.)*
  const [notes, setNotes] = useState('')
  const [notesOpen, setNotesOpen] = useState(false)
  // Held in state rather than recomputed: a new example every render would
  // change the placeholder as you type into an empty field.
  const [example, setExample] = useState(randomExample)
  // Enter has been pressed at least once. The list pill only marks itself
  // as needed after that — see the comment where it is rendered.
  const [triedToSubmit, setTriedToSubmit] = useState(false)
  // Which autocomplete row is active. `null` means the menu is closed —
  // one value rather than an `open` flag plus an index, so the two can
  // never disagree about whether a row is highlighted.
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const inputRef = useRef<HTMLDivElement>(null)
  // The autocomplete, so its real width can be measured for the clamp.
  const menuRef = useRef<HTMLUListElement>(null)
  // Flips once the menu is in the DOM, which is what re-runs the placement
  // effect with a box it can actually measure. A ref alone cannot: writing
  // to one does not re-render, so the first (unmeasurable) pass would be
  // the only one.
  const [menuMounted, setMenuMounted] = useState(false)
  const notesRef = useRef<HTMLTextAreaElement>(null)
  // Where to put the caret after a pill rewrites the text. A ref rather
  // than state: it is consumed once by the effect below and must not
  // itself cause a render.
  const caretTo = useRef<number | null>(null)

  // One instant per render, so the date a preview shows and the date that
  // gets written cannot straddle midnight (docs/specs/quick-add.md).
  const now = new Date()
  // Parsed in two passes, because whether dates are read at all depends on
  // the list — and which list is meant is itself something only the parse
  // can say.
  //
  // The first pass resolves the `#token`; if the list it names takes no due
  // dates (docs/specs/list-kinds.md) the second runs with date matching
  // off, so a date is never recognised and never stripped from the summary.
  // The alternative — parse, then discard the due — deletes the words that
  // produced it from the title and stores them nowhere.
  //
  // Deriving this from the text rather than holding it in state is what
  // makes it reversible: retarget the line at a list that does take dates
  // and the next render parses them again. *(added 2026-08-14, on review.)*
  const parsed = useMemo(
    () => {
      const first = parseQuickAdd(text, props.lists, now)
      const target = props.lists.find(
        (list) => list.id === (first.listId ?? props.defaultListId),
      )
      if (!target || !featuresOf(target.displayName).noDueDates) return first
      return parseQuickAdd(text, props.lists, now, { noDates: true })
    },
    // `now` is deliberately not a dependency: it changes every render by
    // definition, and including it would defeat the memo entirely. The
    // parse is re-run whenever the text or the lists change, which is when
    // its answer can actually differ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [text, props.lists, props.defaultListId],
  )

  // The `#token` the caret is currently inside, if any — that is what the
  // autocomplete filters on. Matched at the end of the text before the
  // caret so it only ever fires on the token being typed, not on one
  // completed earlier in the line.
  const listQuery = useMemo(() => activeListQuery(text), [text])

  const fuse = useMemo(
    () =>
      new Fuse(props.lists, {
        keys: ['displayName'],
        threshold: 0.4,
      }),
    [props.lists],
  )

  const suggestions = useMemo(() => {
    if (listQuery === null) return []
    // An empty query — the moment `#` is typed — offers every list rather
    // than nothing, so the menu is a picker before it is a filter.
    if (listQuery === '') return props.lists.slice(0, 6)
    return fuse
      .search(listQuery)
      .slice(0, 6)
      .map((hit) => hit.item)
  }, [listQuery, props.lists, fuse])

  // Whether the field holds focus. The autocomplete hangs off the token
  // being typed, so it has no business being on screen when nobody is
  // typing — it used to stay open over the controls below after a click
  // elsewhere, because "is there a `#token`" was the only condition.
  // *(fixed 2026-08-19, reported from use.)*
  const [fieldFocused, setFieldFocused] = useState(true)

  const menuOpen =
    suggestions.length > 0 && activeIndex !== null && fieldFocused

  // Where the autocomplete sits: under the caret, like any other
  // autocomplete.
  //
  // Both coordinates come from the caret's own rect rather than the
  // field's box. The offset started as a hardcoded `3.25rem` from the
  // popup's top, which assumed a field exactly one line tall — once it
  // wrapped, the menu landed over the text. Following the field's bottom
  // edge fixed that but left the menu pinned to the left margin, far from
  // the `#` being typed on a long line. The caret is what the menu is
  // about, so it is what the menu hangs off.
  // *(changed 2026-08-19, reported from use.)*
  const [menuAt, setMenuAt] = useState<{ top: number; left: number } | null>(
    null,
  )

  useLayoutEffect(() => {
    if (!menuOpen) return
    const field = inputRef.current
    const popup = field?.closest<HTMLElement>(`.${styles['popup'] ?? ''}`)
    const menu = menuRef.current
    if (!field || !popup) return
    const popupBox = popup.getBoundingClientRect()
    const caret = caretRect(field)
    // No caret rect — the selection is elsewhere, or collapsed in a way
    // the browser reports as empty — so fall back to the field's own
    // bottom-left, which is where the menu used to sit unconditionally.
    const fieldBox = field.getBoundingClientRect()
    const anchor = caret ?? { bottom: fieldBox.bottom, left: fieldBox.left }

    // **Clamped against the viewport, using the menu's real width.**
    //
    // Two bugs in one line before this. The clamp was against the *popup*
    // and used the menu's `min-width` rather than what it actually
    // measures, so a menu with room to spare was still nudged left off the
    // caret — while one near the right edge of a narrow window ran past
    // the screen and took a horizontal scrollbar with it. The modal is not
    // the boundary that matters; the window is, and a menu is free to
    // overhang the modal's edge as long as it stays on screen.
    //
    // `menuRef` is measured rather than assumed: the box is sized by its
    // contents (`width: max-content`), so its width depends on the longest
    // list name and cannot be known ahead of time.
    // *(fixed 2026-08-19, reported from use.)*
    // The first pass runs before the menu is in the DOM, so it measures
    // nothing and falls back to the minimum; `menuMounted` below re-runs
    // this once the box exists and its real width can be read.
    const width = menu?.getBoundingClientRect().width ?? MENU_MIN_WIDTH
    const rightLimit = window.innerWidth - MENU_VIEWPORT_MARGIN - width
    const left = Math.max(
      MENU_VIEWPORT_MARGIN,
      Math.min(anchor.left, rightLimit),
    )
    setMenuAt({
      top: anchor.bottom - popupBox.top,
      left: left - popupBox.left,
    })
  }, [menuOpen, text, menuMounted])

  // Reset when the modal opens, not when it closes: closing animates, and
  // clearing on the way out empties the field in front of the user.
  useEffect(() => {
    if (props.open) {
      setText('')
      setNotes('')
      setNotesOpen(false)
      setActiveIndex(null)
      setTriedToSubmit(false)
      // A fresh example each time it opens, which is what makes it a
      // teaching surface rather than decoration (see EXAMPLES).
      setExample(randomExample())
    }
  }, [props.open])

  // Focus the notes field once it exists.
  //
  // A layout effect keyed on `notesOpen`, not a `requestAnimationFrame` in
  // the trigger's click handler: the dialog's focus trap runs its own
  // restore after the click, so a focus scheduled on the next frame was
  // taken back and the *popup* ended up focused instead of the field.
  // Running before paint puts this after the render that mounts the
  // textarea and ahead of anything the trap does with the click.
  // *(fixed 2026-08-14, found in review: activating "+ Notes" focused the
  // modal rather than the field it revealed.)*
  useLayoutEffect(() => {
    if (notesOpen) notesRef.current?.focus()
  }, [notesOpen])

  // The caret a pill asks for is applied by the field itself, in the same
  // layout effect that draws the marks — the two have to happen together
  // or the caret is placed into a DOM that is about to be replaced.
  // *(moved into quick-add-field 2026-08-19; it was a `setSelectionRange`
  // here while the field was an `<input>`.)*

  // Grow and shrink the notes field to fit what is in it.
  //
  // `height = 'auto'` first, then `scrollHeight`: without the reset the
  // element's own height floors the measurement, so the field grows on a
  // new line and then never comes back down when one is deleted. That
  // reset-then-measure pair is the whole trick, and the reason this cannot
  // be done in CSS alone.
  //
  // A layout effect keyed on the value, not an `onChange` handler: the
  // height must be correct for *any* way the text changed — the reset when
  // the modal reopens, and a paste as much as a keystroke — and it must
  // land before paint or the field visibly jumps a frame after the
  // character appears. *(added 2026-08-14.)*
  useLayoutEffect(() => {
    const field = notesRef.current
    if (!field) return
    field.style.height = 'auto'
    field.style.height = `${field.scrollHeight}px`
  }, [notes, notesOpen])

  // Opening the menu whenever a `#token` appears, and closing it when the
  // token goes away. Kept in an effect rather than in the keydown handler
  // so it holds however the text changed — paste and autocorrect included.
  useEffect(() => {
    setActiveIndex(listQuery === null ? null : 0)
  }, [listQuery])

  const targetListId = parsed.listId ?? props.defaultListId
  const targetList = props.lists.find((list) => list.id === targetListId)
  // docs/specs/list-kinds.md — a media list's todos have no due date, so a
  // parsed one is dropped rather than written. Shown struck through in the
  // preview so the reason is visible *before* submitting.
  const noDueDates = targetList
    ? featuresOf(targetList.displayName).noDueDates
    : false
  // Why the date pill is off: the list's name, then one sentence.
  //
  // Not a heading over a body. That shape came from the sparkle popover,
  // which really is an explainer you go and open; this appears *because*
  // you touched a control that refused you, so the context is already
  // established and a title restates it. One sentence, with emphasis only
  // where it names things — the list, and the feature.
  //
  // "Recognised list" is the term for that feature, used here, in the
  // sparkle popover and in Help so one thing has one name
  // (docs/specs/list-kinds.md). The kind's own description is deliberately
  // *not* reused: it explains what a reading list is, which restates the
  // first clause instead of saying what to do about it.
  // *(added 2026-08-14; collapsed from two paragraphs on review.)*
  const dueDatesOffList =
    noDueDates && targetList && kindExplanation(targetList.displayName)
      ? targetList.displayName
      : undefined

  const canSubmit = parsed.summary !== '' && targetListId !== undefined
  // Enter was pressed and there was nowhere to file the todo. One value,
  // read by both the list pill's marker and the footer's message, so the
  // border and the words can never disagree.
  const needsList = triedToSubmit && targetListId === undefined

  const accept = (list: TodoList): void => {
    if (listQuery === null) return
    // Replace the partial token with the full name, and leave a trailing
    // space so typing continues rather than extending the token.
    const start = text.lastIndexOf('#')
    const next = `${text.slice(0, start)}#${list.displayName} `
    setText(next)
    // Caret after the trailing space, so typing carries on from the name
    // just chosen. The pill path below has always done this; this one did
    // not, and got away with it while the field was an `<input>` whose
    // caret the browser kept at the end of the value on its own. A
    // contenteditable is redrawn around the new token instead, which left
    // the caret stranded wherever it had been — arrow keys and clicking
    // could not recover it, though `⌘→` could.
    // *(fixed 2026-08-19, reported from use.)*
    caretTo.current = next.length
    setActiveIndex(null)
    inputRef.current?.focus()
  }

  /**
   * A pill's choice, applied to the **text** rather than to state
   * (docs/specs/quick-add.md — the pills edit the text).
   *
   * The token's spelling matters: `#My Errands` cannot round-trip, because
   * the grammar stops a `#token` at whitespace, so the parse would read
   * `#My` and leave "Errands" in the summary. A name with a space is
   * therefore written with its spaces removed — `#MyErrands` — which the
   * prefix match in `findList` still resolves back to the right list.
   *
   * Focus returns to the input either way: the menu is a detour, not a
   * destination, and the next thing you do is keep typing.
   */
  const setList = (list: TodoList, token: QuickAddToken | undefined): void => {
    const spelling = `#${list.displayName.replace(/\s+/g, '')}`
    const next = replaceToken(text, token, spelling)
    // A trailing space, and the caret after it.
    //
    // Without the space the line *ends* in a `#token`, which is exactly
    // what `activeListQuery` looks for — so choosing a list from the pill
    // immediately reopened the inline picker over the choice just made.
    // The autocomplete's own `accept` always added one; this path did not.
    // The space also means the next thing typed starts a new word rather
    // than extending the list name. *(fixed 2026-08-14, found in review.)*
    const withSpace = next.endsWith(' ') ? next : `${next} `
    setText(withSpace)
    caretTo.current = withSpace.length
    inputRef.current?.focus()
  }

  /**
   * The date and time pills, written back into the text.
   *
   * Both go through one speller so the pair always lands as a single
   * token: a date and a time written separately would be two date matches
   * in the line, and the second would not necessarily attach to the first.
   * `2026-08-25 15:00` is one phrase chrono reads as one instant, and it
   * round-trips — which is the property the whole text-is-the-truth design
   * rests on.
   *
   * Clearing the date clears the time with it, exactly as the edit form's
   * Date switch does (due-controls.tsx): a time with no date is not
   * expressible in DUE.
   */
  const writeDue = (
    date: string,
    time: string,
    token: QuickAddToken | undefined,
  ): void => {
    const spelling = date === '' ? '' : time === '' ? date : `${date} ${time}`
    setText(replaceToken(text, token, spelling))
  }

  const setDate = (date: string, token: QuickAddToken | undefined): void => {
    writeDue(date, date === '' ? '' : (parsed.due?.time ?? ''), token)
  }

  const setTime = (time: string, token: QuickAddToken | undefined): void => {
    // Only reachable with a date already set — the time pill does not
    // render otherwise — so the date is always there to pair with.
    writeDue(parsed.due?.date ?? '', time, token)
  }

  const setPriority = (
    priority: TodoPriority | null,
    token: QuickAddToken | undefined,
  ): void => {
    // `null` is "None", which removes the token rather than writing `p4` —
    // the summary should not carry a token that sets nothing.
    setText(replaceToken(text, token, priority ? PRIORITY_TOKEN[priority] : ''))
    inputRef.current?.focus()
  }

  const submit = (): void => {
    // Recorded before the guard, so a blocked Enter is what turns the list
    // pill's marker on — the attempt is the signal, not the typing.
    setTriedToSubmit(true)
    if (!canSubmit || targetListId === undefined) return
    const due = parsed.due && !noDueDates ? fieldsToDue(parsed.due) : undefined
    const description = notes.trim()
    props.onAdd(targetListId, {
      uid: crypto.randomUUID(),
      summary: parsed.summary,
      ...(due ? { due } : {}),
      ...(parsed.priority ? { priority: parsed.priority } : {}),
      ...(description ? { description } : {}),
    })
    props.onOpenChange(false)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    // Ctrl+N/P move the selection, matching readline — the hands stay on
    // the home row through an interaction whose whole point is speed.
    // Arrows do the same, so nothing has to be learned first
    // (docs/specs/quick-add.md).
    const next =
      event.key === 'ArrowDown' || (event.ctrlKey && event.key === 'n')
    const previous =
      event.key === 'ArrowUp' || (event.ctrlKey && event.key === 'p')

    if (menuOpen && (next || previous)) {
      event.preventDefault()
      const count = suggestions.length
      const current = activeIndex ?? 0
      setActiveIndex(
        next ? (current + 1) % count : (current - 1 + count) % count,
      )
      return
    }

    if (menuOpen && (event.key === 'Enter' || event.key === 'Tab')) {
      const choice = suggestions[activeIndex ?? 0]
      if (choice) {
        event.preventDefault()
        accept(choice)
      }
      return
    }

    // Esc closes the menu first and the modal second, so dismissing a
    // suggestion never throws away what has been typed.
    if (event.key === 'Escape' && menuOpen) {
      event.preventDefault()
      setActiveIndex(null)
      return
    }

    // Tab is deliberately *not* intercepted. It used to open the notes
    // field and focus it, which meant tabbing out of the input silently
    // added a field nobody asked for — adding notes is a deliberate act,
    // and Tab is "move to the next control", not "create one". Native Tab
    // reaches the "+ Notes" button, and Enter or Space there opens it, so
    // the keyboard path is the same deliberate choice the pointer makes.
    // *(changed 2026-08-14, found in review.)*

    // `!shiftKey`, matching the notes field below. Shift+Enter belongs to
    // notes (docs/specs/quick-add.md — the footer lists it), and this
    // branch used to catch it too, so Shift+Enter from the summary
    // submitted the todo. The old `<input>` hid it: the field cleared as
    // the modal closed, so it read as "the shortcut did nothing" rather
    // than as an accidental submit.
    // *(fixed 2026-08-19, surfaced by the wrapping field's own e2e test.)*
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles['backdrop']} />
        {/* A positioning layer between the backdrop and the popup, so the
            modal can rise as the field grows rather than running off the
            bottom of the screen (quick-add-modal.module.css —
            `.popupLayer`). *(added 2026-08-19.)* */}
        <div className={styles['popupLayer']}>
          {/* Collapsible spacer: holds the popup at the launcher height and
              gives that space back as it grows, so a tall modal rises
              instead of running off the bottom. */}
          <div className={styles['popupSpacer']} />
          <Dialog.Popup
            className={styles['popup']}
            finalFocus={props.triggerRef}
          >
            {/* Named for screen readers without drawing a heading: the
              field's own placeholder is the visible label, and a title bar
              would make this a form again. */}
            <Dialog.Title className={styles['srOnly']}>Add a todo</Dialog.Title>
            {/* One element, marks and all: what you type into *is* what
              shows the marks, so a recognised token can be padded. It used
              to be a transparent `<input>` over a shadow layer holding the
              same text, which is the arrangement that made padding
              impossible (docs/specs/quick-add.md — the mark is padded
              because the field is a contenteditable).
              *(changed 2026-08-19.)* */}
            <QuickAddField
              fieldRef={inputRef}
              // Emptied once closed. The text is cleared on *open* rather
              // than on close, because clearing on the way out blanks the
              // field in front of you mid-animation — but the popup stays
              // mounted through that animation, and this field's contents
              // are now real text nodes rather than an `<input>`'s value.
              // So a plain text query finds the summary twice: once on the
              // row it just created, once still sitting here. The shadow
              // layer this replaced had the same problem and the same fix.
              // *(added 2026-08-19: it broke four e2e specs with "resolved
              // to 2 elements".)*
              value={props.open ? text : ''}
              tokens={props.open ? parsed.tokens : EMPTY_TOKENS}
              caretTo={caretTo}
              onChange={setText}
              onKeyDown={onKeyDown}
              onFocusChange={setFieldFocused}
              placeholder={example}
            />

            {/* The `#` autocomplete, floating over the modal rather than
              sitting in its flow.

              It used to be a block between the input and the notes row,
              which pushed everything below it down as you typed and pulled
              it back as the token resolved — the pills jumping under the
              pointer mid-choice. Anchored and absolutely positioned, it
              overlays instead, and it wears the same popup and row styles
              the pill menus use so the two ways of choosing a list look
              like one control. *(changed 2026-08-14, found in review.)* */}
            {menuOpen && (
              <ul
                ref={(node) => {
                  menuRef.current = node
                  setMenuMounted(node !== null)
                }}
                className={cx(styles['menuPopup'], styles['inlineMenu'])}
                style={
                  menuAt === null
                    ? undefined
                    : { top: menuAt.top, left: menuAt.left }
                }
              >
                {suggestions.map((list, index) => (
                  <li key={list.id}>
                    <button
                      type="button"
                      className={cx(
                        styles['menuItem'],
                        index === activeIndex && styles['menuItemActive'],
                      )}
                      // Pointer-down rather than click: the input must not
                      // lose focus before the choice is applied.
                      onMouseDown={(event) => {
                        event.preventDefault()
                        accept(list)
                      }}
                    >
                      <span
                        className={cx(
                          styles['dot'],
                          list.color === undefined && styles['dotEmpty'],
                        )}
                        {...(list.color === undefined
                          ? {}
                          : { style: { background: list.color } })}
                        aria-hidden="true"
                      />
                      {list.displayName}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Notes: the one thing the grammar does not cover, because prose
              does not belong on a line with tokens in it
              (docs/specs/quick-add.md — the full form).

              Collapsed until asked for, so the common case is still a
              single field. Tab from the input opens it — Tab is already
              "go to the next thing", so the field it reveals is the next
              thing rather than a new gesture to learn — and the button is
              the same affordance for a finger. */}
            {notesOpen ? (
              <textarea
                ref={notesRef}
                className={styles['notes']}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                onKeyDown={(event) => {
                  // Enter submits from here too, so notes never cost a reach
                  // for the mouse. Shift+Enter is a newline, which is the
                  // convention every message box has taught — and is
                  // explained in the footer's help popover rather than by a
                  // line under this field, which was a second permanent
                  // sentence for a rule most people already know.
                  // *(moved 2026-08-14.)*
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    submit()
                  }
                }}
                placeholder="Notes"
                aria-label="Notes"
                // One line to start; the effect above grows it from there.
                // `rows={2}` held an empty field two lines tall, which is
                // the reserved space an auto-growing field exists to avoid.
                rows={1}
              />
            ) : (
              <button
                type="button"
                className={styles['notesTrigger']}
                // Activating this *is* the deliberate act — by click, tap,
                // Enter or Space — so focus follows into the field it
                // reveals. Tab alone only moves here; it does not fire.
                // The focusing itself is an effect below, not a callback:
                // see `notesOpen`.
                onClick={() => setNotesOpen(true)}
              >
                <LuPlus aria-hidden="true" size={12} />
                Notes
              </button>
            )}

            <Preview
              parsed={parsed}
              list={targetList}
              lists={props.lists}
              noDueDates={noDueDates}
              dueDatesOffList={dueDatesOffList}
              now={now}
              needsList={needsList}
              onSetDate={setDate}
              onSetTime={setTime}
              onSetList={setList}
              onSetPriority={setPriority}
            />

            {/* The footer: what went wrong, or what the keys do, and the
              button.

              **A message, not just the marked pill.** Enter used to move
              focus to the list pill and say nothing else, which asks you to
              infer the rule from a border — and on a screen reader said
              nothing at all. `role="alert"` announces it.

              **The hint is a line, not the placeholder**, because a
              placeholder is gone by the time you have typed enough to want
              a second line — exactly when Shift+Enter matters. */}
            <div className={styles['footer']}>
              {/* Everything true at once, rather than one message replacing
                another. "Enter to add" stays true while notes has focus and
                while the list is missing; swapping it out read as the rule
                having *changed* when in fact something was added to it.
                So the Shift line joins it where it applies, and the error
                sits above both rather than in place of them.
                *(changed 2026-08-14: these took turns.)* */}
              <div className={styles['footerMessages']}>
                {needsList && (
                  <p
                    className={cx(styles['note'], styles['noteError'])}
                    role="alert"
                  >
                    Choose a list for this todo
                  </p>
                )}
                {/* The keyboard rules, behind a popover rather than printed
                  in the footer.

                  Two permanent sentences of instruction sat under a modal
                  whose whole argument is restraint, and they were being
                  read every time to say something you learn once. A quiet
                  "Keyboard" trigger keeps the answer one click away for
                  the day you want it and silent afterwards.
                  *(changed 2026-08-14.)* */}
                <Popover.Root>
                  <Popover.Trigger className={styles['helpTrigger']}>
                    <LuCircleHelp aria-hidden="true" size={13} />
                    Keyboard
                  </Popover.Trigger>
                  <Popover.Portal>
                    {/* Below the trigger, left edges aligned. It opened
                      upwards, which put it over the pills and the input —
                      the things it is describing. Downwards it covers only
                      the page behind the modal. *(changed 2026-08-14.)* */}
                    <Popover.Positioner
                      className={styles['menuPositioner']}
                      side="bottom"
                      align="start"
                      sideOffset={6}
                    >
                      <Popover.Popup className={styles['helpPopup']}>
                        {/* Real keycaps, composed from the shared component's
                          classes (`helpCap`) so a key here is drawn like a
                          key everywhere else in the app. */}
                        <dl className={styles['helpList']}>
                          <dt>
                            <kbd className={styles['helpCap']}>Enter</kbd>
                          </dt>
                          <dd>Add the todo</dd>
                          <dt>
                            <kbd className={styles['helpCap']}>Shift</kbd> +{' '}
                            <kbd className={styles['helpCap']}>Enter</kbd>
                          </dt>
                          <dd>A new line, in notes</dd>
                          <dt>
                            <kbd className={styles['helpCap']}>Esc</kbd>
                          </dt>
                          <dd>Close without adding</dd>
                        </dl>
                      </Popover.Popup>
                    </Popover.Positioner>
                  </Popover.Portal>
                </Popover.Root>
              </div>
              {/* Cancel, then Add — the pair a dialog is expected to end
                with, and the only visible way out of this one. There is no
                header and so no ✕, which is deliberate (a title bar would
                make this a form again), but that left Escape and clicking
                the scrim as the sole exits — neither of which is visible,
                and Escape is not reachable on a phone at all.
                *(added 2026-08-14, on review.)* */}
              {/* The two actions travel together on the right. The footer
                is `space-between` — the hint or error on the left, the
                actions on the right — so without this group Cancel would
                be pushed into the middle of the row, reading as unrelated
                to the button it belongs with. */}
              <div className={styles['footerActions']}>
                <Dialog.Close className={styles['cancel']}>Cancel</Dialog.Close>
                {/* Enter still submits — this is the same action, reachable
                  by a finger. Not disabled when the form is incomplete: a
                  dead button explains nothing, while pressing it produces
                  the message above. *(added 2026-08-14.)* */}
                <button
                  type="button"
                  className={styles['submit']}
                  onClick={submit}
                >
                  Add todo
                </button>
              </div>
            </div>
          </Dialog.Popup>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** The token each rank is written as — the inverse of the parser's map. */
const PRIORITY_TOKEN: Record<TodoPriority, string> = {
  high: 'p1',
  medium: 'p2',
  low: 'p3',
}

/**
 * Placeholder examples, one picked at random each time the modal opens.
 *
 * The syntax is invisible by design — a plain line makes a plain todo — so
 * the placeholder is the only place it gets taught. One fixed example
 * teaches one shape and then stops being read; rotating through these puts
 * a different combination in front of you each time, so the grammar is
 * absorbed by use rather than looked up.
 *
 * Chosen to cover the whole grammar between them rather than to be varied
 * for its own sake: bare summaries, each token alone, and the combinations.
 * The list names are deliberately generic — a real list is unlikely to be
 * called "errands", so nobody reads a placeholder as a filed todo.
 * *(added 2026-08-14.)*
 */
const EXAMPLES: readonly string[] = [
  'Clean the gutters tomorrow at 3pm #chores p1',
  'Book the dentist next tuesday',
  'Water the plants friday #garden',
  'Renew the car rego 25 Aug p2',
  'Call mum sunday 6pm',
  'Pay the electricity bill in 3 days p1',
  'Take the bins out tonight #chores',
  'Draft the quarterly review next monday p2',
  'Pick up the dry cleaning saturday morning',
  'Send the invoice today p1 #work',
  'Replace the smoke alarm battery next week',
  'Order more coffee beans #groceries',
  'Ring the plumber tomorrow 9am p1',
  'Back up the photos this weekend p3',
  'Renew the passport in 2 weeks',
  'Book flights for the trip next friday p2',
  'Sort out the shed someday',
  'Check the tyre pressures saturday',
]

/** One example, chosen fresh per open — see EXAMPLES. */
function randomExample(): string {
  const index = Math.floor(Math.random() * EXAMPLES.length)
  return EXAMPLES[index] ?? EXAMPLES[0] ?? ''
}

/** The `#token` the caret is inside, or null. */
function activeListQuery(text: string): string | null {
  const match = /(?:^|\s)#([\p{L}\p{N}_-]*)$/u.exec(text)
  return match ? (match[1] ?? '') : null
}

/**
 * The text with recognised tokens wrapped so CSS can dim them.
 *
 * `cursor` only ever moves forwards, and a token starting behind it is
 * skipped. The parser guarantees non-overlapping ranges now, but this is
 * the code that *visibly* broke when it did not: a backwards slice emitted
 * text it had already emitted, so the input read
 * "…#Chores3pm#Chores 3pm" while the value behind it was fine. A render
 * that duplicates the user's own words is worth one guard.
 * *(hardened 2026-08-14, found in review.)*
 */
